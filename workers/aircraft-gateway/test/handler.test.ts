// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parseAllowedOrigins } from '../src/cors.ts';
import type { EdgeCacheStore } from '../src/edgeCache.ts';
import { createGateway } from '../src/handler.ts';
import { ADSB_LOL_INFO, createAdsbLolProvider } from '../src/providers/adsbLol.ts';
import { UpstreamThrottle } from '../src/throttle.ts';
import worker from '../src/index.ts';
import type { AircraftResponse } from '../src/types.ts';
import { FakeEdgeStore } from './fakeEdgeStore.ts';
import fixture from './fixtures/adsblol-point.json';

const ORIGIN = 'https://www.alessandropezzali.it';
const Q = '/v1/aircraft?lat=45.07&lon=7.69&r=140';

interface Clock {
  now: number;
  /** Eseguito a ogni sleep del gateway (attese sul lock di un altro isolate). */
  onSleep?: () => Promise<void>;
}

function newClock(): Clock {
  return { now: 1_790_510_000_000 };
}

interface SetupOptions {
  clock?: Clock;
  store?: EdgeCacheStore | null;
  fetchImpl?: (url: string) => Promise<Response>;
}

function okResponse() {
  return new Response(JSON.stringify(fixture), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Un gateway = un isolate. Più setup con lo stesso `store` = stesso data center. */
function setup(opts: SetupOptions = {}) {
  const clock = opts.clock ?? newClock();
  const now = () => clock.now;
  const fetchFn = vi.fn(opts.fetchImpl ?? (async () => okResponse()));
  const gateway = createGateway({
    provider: createAdsbLolProvider({ fetchFn: fetchFn as unknown as typeof fetch, now }),
    allowedOrigins: parseAllowedOrigins(`${ORIGIN},http://localhost:5173`),
    edgeStore: opts.store ?? null,
    now,
    sleep: async (ms) => {
      clock.now += ms;
      await clock.onSleep?.();
    },
    // Orologio finto anche per il throttle: l'attesa fa avanzare il tempo.
    throttle: new UpstreamThrottle({
      minIntervalMs: 1_100,
      maxQueue: 2,
      now,
      sleep: async (ms) => {
        clock.now += ms;
      },
    }),
  });
  const pending: Promise<unknown>[] = [];
  const waitUntil = vi.fn((p: Promise<unknown>) => {
    pending.push(p);
  });
  const call = (path: string, init: RequestInit & { origin?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    const origin = init.origin === undefined ? ORIGIN : init.origin;
    if (origin !== null) headers.set('Origin', origin);
    return gateway.handle(new Request(`https://aircraft.example${path}`, { ...init, headers }), {
      waitUntil,
    });
  };
  return {
    clock,
    gateway,
    fetchFn,
    waitUntil,
    call,
    flush: () => Promise.all(pending.splice(0)),
    advance: (ms: number) => {
      clock.now += ms;
    },
  };
}

async function body(res: Response) {
  return (await res.json()) as AircraftResponse & Record<string, unknown>;
}

const cacheOf = (res: Response) => res.headers.get('X-EarthRadar-Cache');

describe('GET /v1/aircraft', () => {
  it('200 con formato normalizzato, attribuzione ODbL e CORS', async () => {
    const t = setup();
    const res = await t.call(Q);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(cacheOf(res)).toBe('miss');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(res.headers.get('Age')).toBe('0');

    const b = await body(res);
    expect(b).toMatchObject({
      v: 1,
      status: 'ok',
      reason: null,
      area: { lat: 45, lon: 7.5, radiusNm: 150 },
      providerTime: 1790510015501,
      fetchedAt: t.clock.now,
      ttlS: 30,
      count: 6,
    });
    // Il corpo è condiviso fra utenti: niente campi per richiesta.
    expect(b).not.toHaveProperty('requested');
    expect(b).not.toHaveProperty('servedAt');
    expect(b).not.toHaveProperty('cache');
    expect(b.provider).toEqual(ADSB_LOL_INFO);
    expect(b.provider.license.id).toBe('ODbL-1.0');
    expect(b.provider.attribution).toMatch(/ADSB\.lol contributors/);
    expect(b.aircraft).toHaveLength(6);
    expect(t.fetchFn).toHaveBeenCalledWith(
      'https://api.adsb.lol/v2/point/45/7.5/150',
      expect.anything(),
    );
  });

  it('LADD/PIA: nessun ICAO, callsign o registrazione originale nella risposta', async () => {
    const t = setup();
    const raw = (await (await t.call(Q)).text()).toLowerCase();
    for (const leaked of ['3c1234', 'a0b1c2', 'priv01', 'd-priv', 'pia0001', 'n-pia']) {
      expect(raw).not.toContain(leaked);
    }
    expect(raw.match(/"id":"anon-[0-9a-f]{12}"/g)).toHaveLength(2);
  });

  it('memoria: hit per 30 s nella stessa cella, poi un solo nuovo fetch', async () => {
    const t = setup();
    await t.call(Q);
    t.advance(29_900);
    const hit = await t.call('/v1/aircraft?lat=45.2&lon=7.6&r=101');
    expect(cacheOf(hit)).toBe('hit');
    expect(hit.headers.get('Age')).toBe('29');
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
    t.advance(100);
    expect(cacheOf(await t.call(Q))).toBe('miss');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('coalescing: richieste concorrenti identiche → 1 chiamata upstream', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup({
      fetchImpl: async () => {
        await gate;
        return okResponse();
      },
    });
    const pending = Array.from({ length: 5 }, () => t.call('/v1/aircraft?lat=45&lon=9&r=100'));
    release();
    const results = await Promise.all(pending);
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
    expect(results.map(cacheOf).sort()).toEqual([
      'coalesced',
      'coalesced',
      'coalesced',
      'coalesced',
      'miss',
    ]);
    const bodies = await Promise.all(results.map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
  });

  it('400 su parametri non validi (r > 150 compreso), senza chiamare l’upstream', async () => {
    const t = setup();
    for (const qs of [
      'lat=45&lon=9&r=151',
      'lat=45&lon=9&r=250',
      'lat=45&lon=9&r=10.5',
      'lat=95&lon=9&r=10',
      '',
    ]) {
      const res = await t.call(`/v1/aircraft?${qs}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ v: 1, error: 'invalid_params' });
    }
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('5xx upstream → 502 unavailable; rete → 502; mai dati inventati', async () => {
    const t5 = setup({ fetchImpl: async () => new Response('', { status: 500 }) });
    const r5 = await t5.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(r5.status).toBe(502);
    expect(cacheOf(r5)).toBe('none');
    expect(await body(r5)).toMatchObject({
      status: 'unavailable',
      reason: 'upstream_http_5xx',
      fetchedAt: null,
      aircraft: [],
      count: 0,
    });

    const tn = setup({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const rn = await tn.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(rn.status).toBe(502);
    expect(await body(rn)).toMatchObject({ reason: 'upstream_network' });
  });

  it('upstream invalido → 502 upstream_invalid', async () => {
    const t = setup({ fetchImpl: async () => new Response('<html>oops</html>') });
    const res = await t.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(res.status).toBe(502);
    expect(await body(res)).toMatchObject({ reason: 'upstream_invalid', aircraft: [], count: 0 });
  });

  it('troppe aree diverse in coda → 503 gateway_busy, breaker chiuso', async () => {
    const t = setup();
    // 4 aree distinte nello stesso istante: 1 parte subito, 2 attendono, la 4ª è rifiutata.
    const res = await Promise.all(
      ['lat=45&lon=9&r=25', 'lat=10&lon=10&r=25', 'lat=-30&lon=20&r=25', 'lat=60&lon=-40&r=25'].map(
        (qs) => t.call(`/v1/aircraft?${qs}`),
      ),
    );
    expect(res.map((r) => r.status)).toEqual([200, 200, 200, 503]);
    const busy = await body(res[3] as Response);
    expect(busy).toMatchObject({ status: 'rate_limited', reason: 'gateway_busy', aircraft: [] });
    expect(t.fetchFn).toHaveBeenCalledTimes(3);
    expect(t.gateway.breaker.current()).toBeNull();
  });
});

describe('stale-if-error', () => {
  it('upstream in errore dopo la freschezza → ultima fotografia marcata stale', async () => {
    let fail = false;
    const t = setup({
      fetchImpl: async () => (fail ? new Response('', { status: 500 }) : okResponse()),
    });
    const first = await (await t.call(Q)).text();
    const fetchedAt = t.clock.now;
    fail = true;
    t.advance(31_000);

    const res = await t.call(Q);
    expect(res.status).toBe(200);
    expect(cacheOf(res)).toBe('stale');
    expect(res.headers.get('X-EarthRadar-Stale-Reason')).toBe('upstream_http_5xx');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('Age')).toBe('31');
    const text = await res.text();
    expect(text).toBe(first);
    expect(JSON.parse(text)).toMatchObject({ status: 'ok', fetchedAt });

    // Breaker aperto: la richiesta successiva non chiama l'upstream e serve ancora stale.
    const again = await t.call(Q);
    expect(cacheOf(again)).toBe('stale');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);

    // Oltre freschezza + 120 s la fotografia non è più servita.
    t.advance(120_000);
    const gone = await t.call(Q);
    expect(gone.status).toBe(502);
    expect(await body(gone)).toMatchObject({ aircraft: [], fetchedAt: null });
  });
});

describe('429 e circuit breaker', () => {
  it('429 → 503 rate_limited, nessuna nuova chiamata fino alla scadenza', async () => {
    const t = setup({
      fetchImpl: async () => new Response('', { status: 429, headers: { 'Retry-After': '45' } }),
    });
    const res = await t.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('45');
    const b = await body(res);
    expect(b).toMatchObject({
      status: 'rate_limited',
      reason: 'upstream_429',
      aircraft: [],
      count: 0,
      retryAfterS: 45,
    });
    expect(b.provider.attribution).toMatch(/ODbL/);

    // Anche un'altra area: il breaker vale per tutto il provider.
    const again = await t.call('/v1/aircraft?lat=10&lon=10&r=25');
    expect(again.status).toBe(503);
    expect(cacheOf(again)).toBe('none');
    expect(t.fetchFn).toHaveBeenCalledTimes(1);

    t.advance(45_000);
    await t.call('/v1/aircraft?lat=10&lon=10&r=25');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('Cache API condivisa (stesso data center, isolate diversi)', () => {
  it('isolate B serve la fotografia di A senza chiamare l’upstream', async () => {
    const clock = newClock();
    const store = new FakeEdgeStore(() => clock.now);
    const a = setup({ clock, store });
    const b = setup({ clock, store });

    const ra = await a.call(Q);
    await a.flush();
    expect(store.keys()).toContain(
      'https://aircraft.alessandropezzali.it/__cache/v2/adsb.lol/aircraft/45/7.5/150',
    );

    a.advance(10_000);
    // Altro utente, altra origine, centro diverso nella stessa cella.
    const rb = await b.call('/v1/aircraft?lat=44.9&lon=7.4&r=150', {
      origin: 'http://localhost:5173',
    });
    expect(cacheOf(rb)).toBe('edge');
    expect(rb.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(rb.headers.get('Age')).toBe('10');
    expect(await rb.text()).toBe(await ra.text());
    expect(a.fetchFn).toHaveBeenCalledTimes(1);
    expect(b.fetchFn).not.toHaveBeenCalled();

    // Da qui B serve dalla propria memoria.
    expect(cacheOf(await b.call(Q))).toBe('hit');
  });

  it('dopo 30 s un solo isolate aggiorna, gli altri servono la fotografia precedente', async () => {
    const clock = newClock();
    const store = new FakeEdgeStore(() => clock.now);
    let release!: () => void;
    let gate: Promise<void> | null = null;
    let started!: () => void;
    const fetchStarted = new Promise<void>((r) => (started = r));
    const a = setup({
      clock,
      store,
      fetchImpl: async () => {
        if (gate) {
          started();
          await gate;
        }
        return okResponse();
      },
    });
    const b = setup({ clock, store });

    await a.call(Q);
    await a.flush();
    await b.call(Q); // B ha la fotografia in memoria (edge)
    clock.now += 31_000;

    gate = new Promise<void>((r) => (release = r));
    const pendingA = a.call(Q);
    await fetchStarted; // A ha preso il lock ed è in attesa dell'upstream

    const rb = await b.call(Q);
    expect(rb.status).toBe(200);
    expect(cacheOf(rb)).toBe('stale');
    expect(rb.headers.get('X-EarthRadar-Stale-Reason')).toBe('refreshing');
    expect(b.fetchFn).not.toHaveBeenCalled();

    release();
    expect(cacheOf(await pendingA)).toBe('miss');
    await a.flush();
    expect(a.fetchFn).toHaveBeenCalledTimes(2);

    // La fotografia nuova è ora condivisa: B la prende dalla Cache API.
    expect(cacheOf(await b.call(Q))).toBe('edge');
    expect(b.fetchFn).not.toHaveBeenCalled();
  });

  it('a freddo, con il lock di un altro isolate, attende la sua fotografia', async () => {
    const clock = newClock();
    const store = new FakeEdgeStore(() => clock.now);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started!: () => void;
    const fetchStarted = new Promise<void>((r) => (started = r));
    const a = setup({
      clock,
      store,
      fetchImpl: async () => {
        started();
        await gate;
        return okResponse();
      },
    });
    const b = setup({ clock, store });

    const pendingA = a.call(Q);
    await fetchStarted;
    clock.onSleep = async () => {
      release();
      await pendingA;
      await a.flush();
    };
    const rb = await b.call(Q);
    expect(cacheOf(rb)).toBe('edge');
    expect((await body(rb)).count).toBe(6);
    expect(b.fetchFn).not.toHaveBeenCalled();
  });

  it('a freddo, se l’altro isolate non pubblica nulla → 503 gateway_busy senza fetch', async () => {
    const clock = newClock();
    const store = new FakeEdgeStore(() => clock.now);
    const a = setup({ clock, store, fetchImpl: () => new Promise<Response>(() => undefined) });
    const b = setup({ clock, store });
    void a.call(Q);
    await vi.waitFor(() => expect(a.fetchFn).toHaveBeenCalled());

    const rb = await b.call(Q);
    expect(rb.status).toBe(503);
    expect(await body(rb)).toMatchObject({ reason: 'gateway_busy', aircraft: [] });
    expect(b.fetchFn).not.toHaveBeenCalled();
  });

  it('breaker condiviso: dopo un 429 in A, B non chiama l’upstream', async () => {
    const clock = newClock();
    const store = new FakeEdgeStore(() => clock.now);
    const a = setup({ clock, store, fetchImpl: async () => new Response('', { status: 429 }) });
    const b = setup({ clock, store });

    expect((await a.call(Q)).status).toBe(503);
    await a.flush();

    const rb = await b.call('/v1/aircraft?lat=10&lon=10&r=25');
    expect(rb.status).toBe(503);
    expect(await body(rb)).toMatchObject({ reason: 'upstream_429', retryAfterS: 30 });
    expect(b.fetchFn).not.toHaveBeenCalled();
    expect(b.gateway.breaker.current()).not.toBeNull();

    clock.now += 30_000;
    expect((await b.call('/v1/aircraft?lat=10&lon=10&r=25')).status).toBe(200);
    expect(b.fetchFn).toHaveBeenCalledTimes(1);
  });

  it('errori della Cache API ignorati: il gateway risponde comunque', async () => {
    const broken: EdgeCacheStore = {
      match: async () => {
        throw new Error('cache down');
      },
      put: async () => {
        throw new Error('413');
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup({ store: broken });
    const res = await t.call(Q);
    await t.flush();
    expect(res.status).toBe(200);
    expect(cacheOf(res)).toBe('miss');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('CORS e metodi', () => {
  it('origine non consentita → 403 senza chiamare l’upstream', async () => {
    const t = setup();
    const res = await t.call(Q, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('richiesta senza Origin (curl) consentita, senza header ACAO', async () => {
    const t = setup();
    const res = await t.call('/v1/health', { origin: null });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflight OPTIONS', async () => {
    const t = setup();
    const ok = await t.call('/v1/aircraft', { method: 'OPTIONS' });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const denied = await t.call('/v1/aircraft', { method: 'OPTIONS', origin: 'https://x.example' });
    expect(denied.status).toBe(403);
  });

  it('espone gli header di cache al browser', async () => {
    const t = setup();
    const res = await t.call(Q);
    expect(res.headers.get('Access-Control-Expose-Headers')).toMatch(
      /Age.*X-EarthRadar-Cache.*X-EarthRadar-Stale-Reason/,
    );
  });

  it('metodi non ammessi → 405; path sconosciuto → 404', async () => {
    const t = setup();
    expect((await t.call('/v1/aircraft', { method: 'POST' })).status).toBe(405);
    expect((await t.call('/v2/whatever')).status).toBe(404);
  });

  it('HEAD restituisce solo header', async () => {
    const t = setup();
    const res = await t.call('/v1/health', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('GET /v1/health', () => {
  it('riporta provider, cache e stato breaker senza chiamare l’upstream', async () => {
    const t = setup();
    const res = await t.call('/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = (await res.json()) as Record<string, unknown>;
    expect(b).toMatchObject({
      v: 1,
      ok: true,
      service: 'earthradar-aircraft-gateway',
      version: '0.2.0',
      scope: 'isolate',
      breaker: { open: false },
      lastUpstream: null,
      cache: { ttlS: 30, staleS: 120, memoryEntries: 0, edge: false },
    });
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('dopo un errore upstream riporta il breaker aperto', async () => {
    const t = setup({ fetchImpl: async () => new Response('', { status: 502 }) });
    await t.call('/v1/aircraft?lat=45&lon=9&r=100');
    const b = (await (await t.call('/v1/health')).json()) as Record<string, unknown>;
    expect(b).toMatchObject({
      ok: false,
      breaker: { open: true, status: 'unavailable', reason: 'upstream_http_5xx', retryAfterS: 30 },
      lastUpstream: { ok: false, httpStatus: 502 },
    });
  });
});

describe('entry point Worker', () => {
  it('usa le variabili d’ambiente per allowlist', async () => {
    const res = await worker.fetch(
      new Request('https://gw.example/v1/health', { headers: { Origin: 'https://nope.example' } }),
      { ALLOWED_ORIGINS: ORIGIN, UPSTREAM_BASE_URL: 'https://api.adsb.lol' },
      { waitUntil: () => undefined },
    );
    expect(res.status).toBe(403);
  });
});
