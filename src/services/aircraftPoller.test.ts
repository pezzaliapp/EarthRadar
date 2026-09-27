import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_ALIGN_MS,
  AIRCRAFT_MIN_GAP_MS,
  AIRCRAFT_POLL_MS,
  AircraftPoller,
  type AircraftPollerDeps,
} from './aircraftPoller';
import type { GatewayAircraft, GatewayResult, GatewaySnapshot } from './aircraftGatewayApi';
import { initialAircraftFeedState, type AircraftFeedState } from '@/store/aircraftStore';
import type { ReplayHistory } from '@/lib/aircraftReplay';

const REGGIO = { lat: 44.698, lon: 10.631 };
const AREA = { lat: 44.5, lon: 10.5, radiusNm: 150 };
const TTL_MS = 30_000;
/** Ciclo ordinario con fotografie fresche (Age 0): ttl + margine di allineamento. */
const CYCLE = TTL_MS + AIRCRAFT_ALIGN_MS;

function plane(id: string, lat: number, lon: number): GatewayAircraft {
  return {
    id,
    icao24: id,
    callsign: null,
    registration: null,
    typeCode: null,
    lat,
    lon,
    onGround: false,
    altBaroM: 10_000,
    altGeomM: null,
    groundSpeedMs: 230,
    trackDeg: 90,
    verticalRateMs: null,
    squawk: null,
    emergency: null,
    positionSource: 'adsb',
    positionAgeS: 0,
    lastSeenS: 0,
    privacyRestricted: false,
  };
}

function snapshot(
  fetchedAt: number,
  aircraft: GatewayAircraft[] = [],
  area = AREA,
): GatewaySnapshot {
  return {
    provider: {
      id: 'flyitalyadsb',
      name: 'FlyItalyADSB',
      url: 'https://flyitalyadsb.com/',
      attribution: 'FlyItalyADSB · CC BY-SA 4.0',
      license: { id: 'CC-BY-SA-4.0', name: '', url: '' },
    },
    area,
    providerTime: fetchedAt,
    fetchedAt,
    ttlS: 30,
    aircraft,
  };
}

/** Orologio, timer, visibilità e rete finti: nessuna richiesta reale. */
function harness(opts: { loadReplay?: () => ReplayHistory | null } = {}) {
  let now = 1_790_526_000_000;
  let hidden = false;
  let visibilityCb: (() => void) | null = null;
  let timers: Array<{ id: number; at: number; fn: () => void }> = [];
  let nextId = 1;
  let state: AircraftFeedState = { ...initialAircraftFeedState };
  const calls: Array<{ at: number; lat: number; lon: number; radiusNm: number }> = [];
  const pending: Array<(r: GatewayResult) => void> = [];
  const saved: ReplayHistory[] = [];
  let auto: (() => GatewayResult) | null = () => ({
    kind: 'ok',
    snapshot: snapshot(now),
    gatewayStale: false,
    retryAfterMs: null,
    ageMs: 0,
  });

  const deps: AircraftPollerDeps = {
    fetchArea: (area) => {
      calls.push({ at: now, ...area });
      if (auto) return Promise.resolve(auto());
      return new Promise((resolve) => pending.push(resolve));
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimer: (h) => {
      timers = timers.filter((t) => t.id !== h);
    },
    isHidden: () => hidden,
    subscribeVisibility: (cb) => {
      visibilityCb = cb;
      return () => (visibilityCb = null);
    },
    getState: () => state,
    setState: (p) => {
      state = { ...state, ...p };
    },
    loadReplay: opts.loadReplay,
    saveReplay: (h) => saved.push(h),
  };

  const poller = new AircraftPoller(deps);
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  /** Avanza l'orologio eseguendo i timer scaduti, in ordine. */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      now = Math.max(now, due.at);
      due.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  return {
    poller,
    calls,
    pending,
    saved,
    advance,
    flush,
    state: () => state,
    setHidden: (h: boolean) => {
      hidden = h;
      visibilityCb?.();
    },
    respondWith: (fn: (() => GatewayResult) | null) => {
      auto = fn;
    },
    now: () => now,
  };
}

const ok = (snap: GatewaySnapshot, ageMs: number | null = 0): GatewayResult => ({
  kind: 'ok',
  snapshot: snap,
  gatewayStale: false,
  retryAfterMs: null,
  ageMs,
});

describe('AircraftPoller — un solo polling condiviso, allineato alla cache', () => {
  it('più domande → una sola richiesta; le successive subito dopo la scadenza della fotografia', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    h.poller.setDemand('radar', { enabled: true, center: REGGIO });
    h.poller.setDemand('home', { enabled: true, center: REGGIO }); // re-render
    await h.advance(0);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toMatchObject({ ...REGGIO, radiusNm: 150 });
    await h.advance(CYCLE - 1);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
    await h.advance(CYCLE * 3);
    expect(h.calls).toHaveLength(5);
    expect(h.state().status).toBe('ok');
  });

  it('scheduling = ricezione − Age + ttlS + 1,5 s (fotografia già vecchia di 20 s)', async () => {
    const h = harness();
    h.respondWith(() => ok(snapshot(h.now() - 20_000), 20_000));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    // scade sul gateway fra 10 s: si interroga 11,5 s dopo, non 30 s dopo
    await h.advance(TTL_MS - 20_000 + AIRCRAFT_ALIGN_MS - 1);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
  });

  it('usa Age (orologio del gateway), non l’orologio del client', async () => {
    const h = harness();
    // fetchedAt "nel futuro" per il client (orologio indietro di 60 s), Age 0
    h.respondWith(() => ok(snapshot(h.now() + 60_000), 0));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    await h.advance(CYCLE - 1);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
  });

  it('fotografia di cache ripetuta: nessun loop, riprova subito dopo la sua scadenza', async () => {
    const h = harness();
    const first = snapshot(h.now());
    h.respondWith(() => ok(first, 0));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    // Il gateway restituisce ancora la stessa fotografia (es. altra cache), Age 29 s.
    h.respondWith(() => ok(first, 29_000));
    await h.advance(CYCLE);
    expect(h.calls).toHaveLength(2);
    // Scaduta da −0,5 s: la prossima non parte prima del gap minimo di 5 s…
    await h.advance(AIRCRAFT_MIN_GAP_MS - 1);
    expect(h.calls).toHaveLength(2);
    h.respondWith(() => ok(snapshot(h.now()), 0));
    await h.advance(1);
    expect(h.calls).toHaveLength(3);
    // …e la storia non contiene doppioni della stessa fotografia.
    expect(h.state().history?.lastFetchedAt).toBe(h.state().snapshot?.fetchedAt);
  });

  it('risposta senza Age: ripiego su fetchedAt', async () => {
    const h = harness();
    h.respondWith(() => ok(snapshot(h.now() - 10_000), null));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    await h.advance(TTL_MS - 10_000 + AIRCRAFT_ALIGN_MS - 1);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
  });

  it('una sola richiesta alla volta, anche se il centro cambia durante il fetch', async () => {
    const h = harness();
    h.respondWith(null); // risposte manuali
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', { enabled: true, center: { lat: 41.9, lon: 12.5 } }); // Roma
    await h.advance(20_000);
    expect(h.calls).toHaveLength(1);
    h.pending[0]?.(ok(snapshot(h.now())));
    await h.flush();
    // Il centro nuovo è lontano (> 20 NM): nuova richiesta, ma dopo il gap minimo.
    await h.advance(AIRCRAFT_MIN_GAP_MS);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]).toMatchObject({ lat: 41.9, lon: 12.5 });
  });

  it('piccoli spostamenti (< 20 NM) non generano richieste extra', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', { enabled: true, center: { lat: 44.75, lon: 10.7 } });
    await h.advance(CYCLE - 1);
    expect(h.calls).toHaveLength(1);
  });
});

describe('AircraftPoller — layer OFF e pagina nascosta', () => {
  it('layer spento → nessuna richiesta', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: false, center: REGGIO });
    await h.advance(10 * CYCLE);
    expect(h.calls).toHaveLength(0);
    expect(h.state().status).toBe('off');
  });

  it('spegnendo il layer cessano le richieste e i dati vengono azzerati', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    expect(h.state().snapshot).not.toBeNull();
    h.poller.setDemand('home', { enabled: false, center: REGGIO });
    await h.advance(10 * CYCLE);
    expect(h.calls).toHaveLength(1);
    expect(h.state()).toMatchObject({ status: 'off', snapshot: null, history: null });
  });

  it('componente smontato (domanda ritirata) → nessuna richiesta', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', null);
    await h.advance(10 * CYCLE);
    expect(h.calls).toHaveLength(1);
  });

  it('pagina nascosta → nessuna richiesta; al ritorno refresh solo se scaduto', async () => {
    const h = harness();
    h.setHidden(true);
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(5 * CYCLE);
    expect(h.calls).toHaveLength(0);

    h.setHidden(false);
    await h.advance(0);
    expect(h.calls).toHaveLength(1);

    h.setHidden(true);
    await h.advance(10 * CYCLE);
    expect(h.calls).toHaveLength(1);

    h.setHidden(false);
    await h.advance(0);
    expect(h.calls).toHaveLength(2);

    h.setHidden(true);
    await h.advance(5_000);
    h.setHidden(false);
    await h.advance(0);
    expect(h.calls).toHaveLength(2);
  });
});

describe('AircraftPoller — errori e Retry-After', () => {
  it('rispetta Retry-After più lungo del poll', async () => {
    const h = harness();
    h.respondWith(() => ({
      kind: 'error',
      httpStatus: 503,
      reason: 'upstream_429',
      retryAfterMs: 120_000,
    }));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    expect(h.state()).toMatchObject({ status: 'error', error: 'upstream_429' });
    await h.advance(119_999);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
  });

  it('Retry-After breve o assente: mai prima di 30 s (nessun retry aggressivo)', async () => {
    const h = harness();
    h.respondWith(() => ({
      kind: 'error',
      httpStatus: 503,
      reason: 'gateway_busy',
      retryAfterMs: 2_000,
    }));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    await h.advance(AIRCRAFT_POLL_MS - 1);
    expect(h.calls).toHaveLength(1);
    h.respondWith(() => ({
      kind: 'error',
      httpStatus: null,
      reason: 'network',
      retryAfterMs: null,
    }));
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
    await h.advance(AIRCRAFT_POLL_MS - 1);
    expect(h.calls).toHaveLength(2);
  });

  it('Retry-After vale anche per un cambio di area', async () => {
    const h = harness();
    h.respondWith(() => ({
      kind: 'error',
      httpStatus: 503,
      reason: 'upstream_429',
      retryAfterMs: 90_000,
    }));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', { enabled: true, center: { lat: 41.9, lon: 12.5 } });
    await h.advance(89_999);
    expect(h.calls).toHaveLength(1);
  });

  it('errore dopo dati validi: i dati restano (la UI decide in base all’età)', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.respondWith(() => ({
      kind: 'error',
      httpStatus: 502,
      reason: 'upstream_http_5xx',
      retryAfterMs: 30_000,
    }));
    await h.advance(CYCLE);
    expect(h.state().status).toBe('error');
    expect(h.state().snapshot).not.toBeNull();
  });
});

describe('AircraftPoller — storia del replay e reload', () => {
  it('ogni fotografia reale aggiunge un’osservazione e viene salvata', async () => {
    const h = harness();
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10)])));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10.1)])));
    await h.advance(CYCLE);
    expect(h.state().history?.tracks.get('a1')).toHaveLength(2);
    expect(h.saved).toHaveLength(2);
  });

  it('reload: storia salvata della stessa area → A disponibile appena arriva B reale', async () => {
    const t0 = 1_790_526_000_000;
    const restored: ReplayHistory = {
      area: AREA,
      lastFetchedAt: t0 - 31_500,
      tracks: new Map([['a1', [{ t: t0 - 31_500, lat: 45, lon: 9.9, altM: 10_000 }]]]),
    };
    const h = harness({ loadReplay: () => restored });
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10)])));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    // Prima della risposta reale la storia salvata NON viene mostrata.
    expect(h.state().snapshot).toBeNull();
    expect(h.state().history).toBeNull();
    await h.advance(0);
    expect(
      h
        .state()
        .history?.tracks.get('a1')
        ?.map((o) => o.lon),
    ).toEqual([9.9, 10]);
  });

  it('reload: storia salvata di un’altra area → scartata', async () => {
    const t0 = 1_790_526_000_000;
    const restored: ReplayHistory = {
      area: { lat: 41.5, lon: 12.5, radiusNm: 150 },
      lastFetchedAt: t0 - 31_500,
      tracks: new Map([['a1', [{ t: t0 - 31_500, lat: 45, lon: 9.9, altM: 10_000 }]]]),
    };
    const h = harness({ loadReplay: () => restored });
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10)])));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    expect(h.state().history?.tracks.get('a1')).toHaveLength(1);
  });

  it('reload: storia salvata più vecchia di 150 s rispetto a B → scartata', async () => {
    const t0 = 1_790_526_000_000;
    const restored: ReplayHistory = {
      area: AREA,
      lastFetchedAt: t0 - 151_000,
      tracks: new Map([['a1', [{ t: t0 - 151_000, lat: 45, lon: 9.9, altM: 10_000 }]]]),
    };
    const h = harness({ loadReplay: () => restored });
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10)])));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    expect(h.state().history?.tracks.get('a1')).toHaveLength(1);
  });

  it('cambio area: la storia riparte da zero', async () => {
    const h = harness();
    h.respondWith(() => ok(snapshot(h.now(), [plane('a1', 45, 10)])));
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.respondWith(() =>
      ok(snapshot(h.now(), [plane('a1', 45, 10.1)], { lat: 42, lon: 12.5, radiusNm: 150 })),
    );
    h.poller.setDemand('home', { enabled: true, center: { lat: 42, lon: 12.5 } });
    await h.advance(AIRCRAFT_MIN_GAP_MS);
    expect(h.state().history?.tracks.get('a1')).toHaveLength(1);
  });
});
