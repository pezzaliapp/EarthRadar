// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  BudgetDeniedError,
  BudgetUnavailableError,
  createDurableBudget,
} from '../src/budget/client.ts';
import { UpstreamBudgetObject } from '../src/budget/durableObject.ts';
import { SqlLedgerStore } from '../src/budget/sqlStore.ts';
import { parseAllowedOrigins } from '../src/cors.ts';
import { createGateway } from '../src/handler.ts';
import worker from '../src/index.ts';
import { createFlyItalyAdsbProvider } from '../src/providers/flyItalyAdsb.ts';
import { UpstreamThrottle } from '../src/throttle.ts';
import type { AircraftResponse } from '../src/types.ts';
import {
  fakeNamespace,
  MemoryLedgerStore,
  openNodeSql,
  type FakeNamespaceOptions,
} from './budgetHarness.ts';
import { FakeEdgeStore } from './fakeEdgeStore.ts';
import fixture from './fixtures/readsb-point.json';

const ORIGIN = 'https://www.alessandropezzali.it';
const FAKE_KEY = 'test-fake-key-not-a-real-secret';
const T0 = 1_790_510_000_000;
const q = (lat: number, lon: number) => `/v1/aircraft?lat=${lat}&lon=${lon}&r=150`;
const Q = q(45.07, 7.69);

interface Clock {
  now: number;
}

function okResponse() {
  return new Response(JSON.stringify(fixture), { headers: { 'Content-Type': 'application/json' } });
}

/** Un mondo: un Durable Object globale + N data center × M isolate. */
function world(
  opts: {
    store?: MemoryLedgerStore | SqlLedgerStore;
    ns?: FakeNamespaceOptions;
    fetchImpl?: () => Promise<Response>;
    apiKey?: string | null;
  } = {},
) {
  const clock: Clock = { now: T0 };
  const now = () => clock.now;
  const store = opts.store ?? new MemoryLedgerStore();
  const object = new UpstreamBudgetObject(
    { storage: { sql: { exec: () => ({ toArray: () => [] }) } } },
    undefined,
    { now, store },
  );
  const { ns, calls } = fakeNamespace(object, opts.ns);
  /** Istanti (orologio finto) in cui una richiesta è partita verso FlyItalyADSB. */
  const upstreamAt: number[] = [];
  const fetchFn = vi.fn(async (url: string) => {
    void url;
    upstreamAt.push(clock.now);
    return opts.fetchImpl ? opts.fetchImpl() : okResponse();
  });

  function isolate(edgeStore: FakeEdgeStore | null) {
    const pending: Promise<unknown>[] = [];
    const gateway = createGateway({
      provider: createFlyItalyAdsbProvider({
        apiKey: opts.apiKey === undefined ? FAKE_KEY : (opts.apiKey ?? undefined),
        fetchFn: fetchFn as unknown as typeof fetch,
        now,
      }),
      budget: createDurableBudget(ns),
      allowedOrigins: parseAllowedOrigins(ORIGIN),
      edgeStore,
      now,
      sleep: async (ms) => {
        clock.now += ms;
      },
      throttle: new UpstreamThrottle({
        minIntervalMs: 1_100,
        maxQueue: 4,
        now,
        sleep: async (ms) => {
          clock.now += ms;
        },
      }),
    });
    const call = (path: string) =>
      gateway.handle(
        new Request(`https://aircraft.example${path}`, { headers: { Origin: ORIGIN } }),
        { waitUntil: (p) => void pending.push(p) },
      );
    return { gateway, call, flush: () => Promise.all(pending.splice(0)) };
  }

  return { clock, store, object, ns, calls, upstreamAt, fetchFn, isolate };
}

async function body(res: Response) {
  return (await res.json()) as AircraftResponse;
}

/** Massimo numero di eventi in una qualunque finestra di `windowMs`. */
function maxInWindow(times: number[], windowMs: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  let max = 0;
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi += 1) {
    while (sorted[hi]! - sorted[lo]! >= windowMs) lo += 1;
    max = Math.max(max, hi - lo + 1);
  }
  return max;
}

describe('Durable Object UpstreamBudget — protocollo', () => {
  it('POST /acquire concede; altri metodi e path rifiutati', async () => {
    const w = world();
    const res = await w.object.fetch(new Request('https://b/acquire', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ kind: 'granted', ttlS: 30, usage: { lastMinute: 1 } });
    expect((await w.object.fetch(new Request('https://b/acquire'))).status).toBe(405);
    expect((await w.object.fetch(new Request('https://b/other', { method: 'POST' }))).status).toBe(
      404,
    );
  });

  it('scrittura SQLite fallita (es. quota Free esaurita) → 500, nessun permesso', async () => {
    const store = new MemoryLedgerStore();
    store.failWrites = true;
    const w = world({ store });
    const res = await w.object.fetch(new Request('https://b/acquire', { method: 'POST' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'budget_error' });
  });

  it('funziona con il backend SQLite reale dietro il costruttore', async () => {
    const sql = await openNodeSql();
    try {
      const object = new UpstreamBudgetObject({ storage: { sql } }, undefined, { now: () => T0 });
      const res = await object.fetch(new Request('https://b/acquire', { method: 'POST' }));
      expect(await res.json()).toMatchObject({ kind: 'granted' });
      const again = new UpstreamBudgetObject({ storage: { sql } }, undefined, {
        now: () => T0 + 1,
      });
      const r2 = await again.fetch(new Request('https://b/acquire', { method: 'POST' }));
      expect(await r2.json()).toMatchObject({ usage: { lastMinute: 2 } });
    } finally {
      sql.close();
    }
  });
});

describe('client del budget — fail closed', () => {
  it('binding assente → BudgetUnavailableError', async () => {
    await expect(createDurableBudget(undefined).acquire()).rejects.toBeInstanceOf(
      BudgetUnavailableError,
    );
  });

  it('una sola istanza globale con nome fisso; stub nuovo a ogni chiamata', async () => {
    const w = world();
    const { ns, ids } = fakeNamespace(w.object);
    const budget = createDurableBudget(ns);
    // Lo stub monouso del finto runtime fallirebbe se venisse riusato.
    await budget.acquire();
    await budget.acquire();
    expect(ids).toEqual(['flyitalyadsb-global', 'flyitalyadsb-global']);
  });

  it('errore del runtime → BudgetUnavailableError senza dettagli interni', async () => {
    const w = world({ ns: { fail: () => true } });
    const err = await createDurableBudget(w.ns)
      .acquire()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetUnavailableError);
    expect(String((err as Error).message)).not.toMatch(/reset|interno/);
  });

  it('risposta non 200 o illeggibile → BudgetUnavailableError', async () => {
    for (const res of [
      new Response('{}', { status: 500 }),
      new Response('non-json', { status: 200 }),
      new Response('{"kind":"granted"}', { status: 200 }),
      new Response('{"kind":"denied","scope":"boh","retryAfterMs":5}', { status: 200 }),
    ]) {
      const { ns } = fakeNamespace({ fetch: async () => res });
      await expect(createDurableBudget(ns).acquire()).rejects.toBeInstanceOf(
        BudgetUnavailableError,
      );
    }
  });

  it('Durable Object lento → timeout → BudgetUnavailableError', async () => {
    const { ns } = fakeNamespace(
      { fetch: async () => new Response('{}') },
      { delay: () => new Promise((r) => setTimeout(r, 200)) },
    );
    await expect(createDurableBudget(ns, { timeoutMs: 20 }).acquire()).rejects.toBeInstanceOf(
      BudgetUnavailableError,
    );
  });

  it('rifiuto → BudgetDeniedError con scope e attesa', async () => {
    const w = world();
    await createDurableBudget(w.ns).reportRateLimited(20_000);
    const err = await createDurableBudget(w.ns)
      .acquire()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetDeniedError);
    expect(err).toMatchObject({ scope: 'paused' });
  });
});

describe('gateway + budget globale', () => {
  it('normale: permesso → una chiamata upstream, freschezza 30 s invariata', async () => {
    const w = world();
    const a = w.isolate(null);
    const res = await a.call(Q);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(await body(res)).toMatchObject({ status: 'ok', ttlS: 30, area: { radiusNm: 150 } });
    expect(w.calls).toEqual(['/acquire']);
    expect(w.fetchFn).toHaveBeenCalledTimes(1);
    // Entro 30 s: memoria, nessun permesso chiesto.
    w.clock.now += 29_000;
    expect((await a.call(Q)).headers.get('X-EarthRadar-Cache')).toBe('hit');
    expect(w.calls).toHaveLength(1);
  });

  it('chiave assente: nessun permesso consumato', async () => {
    const w = world({ apiKey: null });
    const res = await w.isolate(null).call(Q);
    expect(await body(res)).toMatchObject({ reason: 'provider_not_configured' });
    expect(w.calls).toHaveLength(0);
  });

  it('Durable Object irraggiungibile → nessuna chiamata upstream, 503 budget_unavailable', async () => {
    let down = true;
    const w = world({ ns: { fail: () => down } });
    const a = w.isolate(null);
    const res = await a.call(Q);
    expect(res.status).toBe(503);
    expect(await body(res)).toMatchObject({
      status: 'unavailable',
      reason: 'budget_unavailable',
      aircraft: [],
    });
    expect(w.fetchFn).not.toHaveBeenCalled();
    // Pausa locale: il Durable Object non viene martellato.
    w.clock.now += 5_000;
    await a.call(Q);
    expect(w.calls).toHaveLength(1);
    // Tornato disponibile: si riparte dopo la pausa.
    down = false;
    w.clock.now += 15_000;
    expect((await a.call(Q)).status).toBe(200);
    expect(w.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('Durable Object irraggiungibile con fotografia precedente → stale, mai dati inventati', async () => {
    let down = false;
    const w = world({ ns: { fail: () => down } });
    const a = w.isolate(null);
    await a.call(Q);
    down = true;
    w.clock.now += 31_000;
    const res = await a.call(Q);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-EarthRadar-Cache')).toBe('stale');
    expect(res.headers.get('X-EarthRadar-Stale-Reason')).toBe('budget_unavailable');
    expect(w.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('quota esaurita → 503 upstream_budget con Retry-After; pausa condivisa nel data center', async () => {
    const w = world();
    // Esaurisce i 4 permessi dei 10 s dal Durable Object stesso.
    for (let i = 0; i < 4; i += 1) {
      await w.object.fetch(new Request('https://b/acquire', { method: 'POST' }));
    }
    const dc = new FakeEdgeStore(() => w.clock.now);
    const a = w.isolate(dc);
    const b = w.isolate(dc);
    const res = await a.call(Q);
    await a.flush();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(await body(res)).toMatchObject({ status: 'rate_limited', reason: 'upstream_budget' });
    expect(w.fetchFn).not.toHaveBeenCalled();
    // Un altro isolate dello stesso data center non interroga il budget.
    const callsBefore = w.calls.length;
    await b.call(q(41.9, 12.5));
    expect(w.calls.length).toBe(callsBefore);
    // Scaduta la finestra, si riparte.
    w.clock.now += 10_000;
    expect((await a.call(Q)).status).toBe(200);
  });

  it('429 del provider → pausa GLOBALE: un altro data center non chiama il provider', async () => {
    let limited = true;
    const w = world({
      fetchImpl: async () =>
        limited
          ? new Response('', { status: 429, headers: { 'Retry-After': '60' } })
          : okResponse(),
    });
    const mxp = w.isolate(new FakeEdgeStore(() => w.clock.now));
    const fco = w.isolate(new FakeEdgeStore(() => w.clock.now));
    expect((await mxp.call(Q)).status).toBe(503);
    await mxp.flush();
    expect(w.calls).toEqual(['/acquire', '/rate-limited']);
    limited = false;
    const res = await fco.call(q(41.9, 12.5));
    expect(await body(res)).toMatchObject({ reason: 'upstream_budget' });
    expect(w.fetchFn).toHaveBeenCalledTimes(1);
    w.clock.now += 60_000;
    await fco.flush();
    expect((await fco.call(q(41.9, 12.5))).status).toBe(200);
  });

  it('errori 5xx del provider: il permesso resta consumato, nessun nuovo tentativo immediato', async () => {
    const w = world({ fetchImpl: async () => new Response('', { status: 502 }) });
    const a = w.isolate(null);
    expect((await a.call(Q)).status).toBe(502);
    expect(await body(await a.call(Q))).toMatchObject({ reason: 'upstream_http_5xx' });
    expect(w.calls).toEqual(['/acquire']);
    expect(w.store instanceof MemoryLedgerStore && w.store.recent).toHaveLength(1);
  });

  it('cache adattiva: vicino al limite giornaliero le fotografie durano 60 s', async () => {
    const store = new MemoryLedgerStore();
    // 7.700 chiamate già nelle ultime 24 h (> 80% di 9.500).
    store.hours.set(Math.floor(T0 / 3_600_000) - 3, 7_700);
    const w = world({ store });
    const a = w.isolate(null);
    const res = await a.call(Q);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await body(res)).toMatchObject({ ttlS: 60 });
    w.clock.now += 45_000;
    expect((await a.call(Q)).headers.get('X-EarthRadar-Cache')).toBe('hit');
    w.clock.now += 16_000;
    await a.call(Q);
    expect(w.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('cache adattiva propagata al data center: un altro isolate rispetta i 60 s', async () => {
    const store = new MemoryLedgerStore();
    store.hours.set(Math.floor(T0 / 3_600_000) - 3, 7_700);
    const w = world({ store });
    const dc = new FakeEdgeStore(() => w.clock.now);
    const a = w.isolate(dc);
    await a.call(Q);
    await a.flush();
    w.clock.now += 45_000;
    const res = await w.isolate(dc).call(Q);
    expect(res.headers.get('X-EarthRadar-Cache')).toBe('edge');
    expect(w.fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('concorrenza: più data center e isolate, molte aree', () => {
  it('in nessuna finestra di 60 s oltre 24 chiamate (né oltre 4 in 10 s)', async () => {
    // Latenza variabile verso il Durable Object: le richieste si intrecciano.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const w = world({
      ns: {
        delay: async () => {
          for (let i = Math.floor(rand() * 5); i > 0; i -= 1) await Promise.resolve();
        },
      },
    });
    const dcs = [0, 1, 2].map(() => new FakeEdgeStore(() => w.clock.now));
    const isolates = dcs.flatMap((dc) => [0, 1, 2].map(() => w.isolate(dc)));
    const cells: string[] = [];
    for (let i = 0; i < 40; i += 1)
      cells.push(q(36 + (i % 10) * 1.0, 6 + Math.floor(i / 10) * 1.5));

    // 5 minuti simulati: ogni 2 s una raffica di 20 richieste concorrenti su aree casuali.
    const end = T0 + 5 * 60_000;
    let served = 0;
    while (w.clock.now < end) {
      const burst = Array.from({ length: 20 }, () => {
        const iso = isolates[Math.floor(rand() * isolates.length)]!;
        const cell = cells[Math.floor(rand() * cells.length)]!;
        return iso.call(cell).then((r) => {
          if (r.status === 200) served += 1;
        });
      });
      await Promise.all(burst);
      await Promise.all(isolates.map((i) => i.flush()));
      w.clock.now += 2_000;
    }

    expect(w.upstreamAt.length).toBeGreaterThan(0);
    expect(maxInWindow(w.upstreamAt, 60_000)).toBeLessThanOrEqual(24);
    expect(maxInWindow(w.upstreamAt, 10_000)).toBeLessThanOrEqual(4);
    // Ogni chiamata partita ha un permesso registrato (nessuna chiamata senza permesso).
    const store = w.store as MemoryLedgerStore;
    const granted = [...store.hours.values()].reduce((a, b) => a + b, 0);
    expect(w.upstreamAt.length).toBe(granted);
    // Gli utenti continuano a ricevere dati (fresh, edge o stale).
    expect(served).toBeGreaterThan(0);
  });
});

describe('entry point Worker', () => {
  it('senza binding UPSTREAM_BUDGET: nessuna chiamata upstream (fail closed)', async () => {
    const realFetch = globalThis.fetch;
    const spy = vi.fn(async () => okResponse());
    globalThis.fetch = spy as unknown as typeof fetch;
    try {
      const res = await worker.fetch(
        new Request(`https://gw.example${Q}`, { headers: { Origin: ORIGIN } }),
        { ALLOWED_ORIGINS: ORIGIN, FLYITALYADSB_API_KEY: FAKE_KEY },
        { waitUntil: () => undefined },
      );
      expect(res.status).toBe(503);
      expect(await body(res)).toMatchObject({ reason: 'budget_unavailable' });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('esporta la classe del Durable Object', async () => {
    const mod = await import('../src/index.ts');
    expect(mod.UpstreamBudgetObject).toBe(UpstreamBudgetObject);
  });
});
