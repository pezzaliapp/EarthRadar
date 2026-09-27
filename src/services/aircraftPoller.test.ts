import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_MIN_GAP_MS,
  AIRCRAFT_POLL_MS,
  AircraftPoller,
  type AircraftPollerDeps,
} from './aircraftPoller';
import type { GatewayResult, GatewaySnapshot } from './aircraftGatewayApi';
import { initialAircraftFeedState, type AircraftFeedState } from '@/store/aircraftStore';

const REGGIO = { lat: 44.698, lon: 10.631 };

function snapshot(fetchedAt: number): GatewaySnapshot {
  return {
    provider: {
      id: 'flyitalyadsb',
      name: 'FlyItalyADSB',
      url: 'https://flyitalyadsb.com/',
      attribution: 'FlyItalyADSB · CC BY-SA 4.0',
      license: { id: 'CC-BY-SA-4.0', name: '', url: '' },
    },
    area: { lat: 44.5, lon: 10.5, radiusNm: 150 },
    providerTime: fetchedAt,
    fetchedAt,
    ttlS: 30,
    aircraft: [],
  };
}

/** Orologio, timer, visibilità e rete finti: nessuna richiesta reale. */
function harness() {
  let now = 1_790_526_000_000;
  let hidden = false;
  let visibilityCb: (() => void) | null = null;
  let timers: Array<{ id: number; at: number; fn: () => void }> = [];
  let nextId = 1;
  let state: AircraftFeedState = { ...initialAircraftFeedState };
  const calls: Array<{ lat: number; lon: number; radiusNm: number }> = [];
  const pending: Array<(r: GatewayResult) => void> = [];
  let auto: (() => GatewayResult) | null = () => ({
    kind: 'ok',
    snapshot: snapshot(now),
    gatewayStale: false,
    retryAfterMs: null,
  });

  const deps: AircraftPollerDeps = {
    fetchArea: (area) => {
      calls.push(area);
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

describe('AircraftPoller — un solo polling condiviso', () => {
  it('più componenti/domande → una sola richiesta, poi una ogni 30 s', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    h.poller.setDemand('radar', { enabled: true, center: REGGIO });
    h.poller.setDemand('home', { enabled: true, center: REGGIO }); // re-render
    await h.advance(0);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]).toEqual({ ...REGGIO, radiusNm: 150 });
    await h.advance(AIRCRAFT_POLL_MS - 1);
    expect(h.calls).toHaveLength(1);
    await h.advance(1);
    expect(h.calls).toHaveLength(2);
    await h.advance(AIRCRAFT_POLL_MS * 3);
    expect(h.calls).toHaveLength(5);
    expect(h.state().status).toBe('ok');
  });

  it('una sola richiesta alla volta, anche se il centro cambia durante il fetch', async () => {
    const h = harness();
    h.respondWith(null); // risposte manuali
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', { enabled: true, center: { lat: 41.9, lon: 12.5 } }); // Roma
    await h.advance(20_000);
    expect(h.calls).toHaveLength(1);
    h.pending[0]?.({
      kind: 'ok',
      snapshot: snapshot(h.now()),
      gatewayStale: false,
      retryAfterMs: null,
    });
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
    await h.advance(AIRCRAFT_POLL_MS - 1);
    expect(h.calls).toHaveLength(1);
  });
});

describe('AircraftPoller — layer OFF e pagina nascosta', () => {
  it('layer spento → nessuna richiesta', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: false, center: REGGIO });
    await h.advance(10 * AIRCRAFT_POLL_MS);
    expect(h.calls).toHaveLength(0);
    expect(h.state().status).toBe('off');
  });

  it('spegnendo il layer cessano le richieste e i dati vengono azzerati', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    expect(h.state().snapshot).not.toBeNull();
    h.poller.setDemand('home', { enabled: false, center: REGGIO });
    await h.advance(10 * AIRCRAFT_POLL_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.state()).toMatchObject({ status: 'off', snapshot: null });
  });

  it('componente smontato (domanda ritirata) → nessuna richiesta', async () => {
    const h = harness();
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(0);
    h.poller.setDemand('home', null);
    await h.advance(10 * AIRCRAFT_POLL_MS);
    expect(h.calls).toHaveLength(1);
  });

  it('pagina nascosta → nessuna richiesta; al ritorno refresh solo se scaduto', async () => {
    const h = harness();
    h.setHidden(true);
    h.poller.setDemand('home', { enabled: true, center: REGGIO });
    await h.advance(5 * AIRCRAFT_POLL_MS);
    expect(h.calls).toHaveLength(0);

    h.setHidden(false);
    await h.advance(0);
    expect(h.calls).toHaveLength(1);

    h.setHidden(true);
    await h.advance(10 * AIRCRAFT_POLL_MS);
    expect(h.calls).toHaveLength(1);

    // Tornata visibile a dati scaduti → un refresh subito.
    h.setHidden(false);
    await h.advance(0);
    expect(h.calls).toHaveLength(2);

    // Tornata visibile a dati ancora freschi → nessun refresh anticipato.
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
    await h.advance(AIRCRAFT_POLL_MS);
    expect(h.state().status).toBe('error');
    expect(h.state().snapshot).not.toBeNull();
  });
});
