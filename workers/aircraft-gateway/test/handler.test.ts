// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parseAllowedOrigins } from '../src/cors.ts';
import { createGateway } from '../src/handler.ts';
import { ADSB_LOL_INFO, createAdsbLolProvider } from '../src/providers/adsbLol.ts';
import { UpstreamThrottle } from '../src/throttle.ts';
import worker from '../src/index.ts';
import type { AircraftResponse } from '../src/types.ts';
import fixture from './fixtures/adsblol-point.json';

const ORIGIN = 'https://www.alessandropezzali.it';

function setup(fetchImpl?: (url: string) => Promise<Response>) {
  let now = 1_790_510_000_000;
  const fetchFn = vi.fn(
    fetchImpl ??
      (async () =>
        new Response(JSON.stringify(fixture), {
          headers: { 'Content-Type': 'application/json' },
        })),
  );
  const gateway = createGateway({
    provider: createAdsbLolProvider({
      fetchFn: fetchFn as unknown as typeof fetch,
      now: () => now,
    }),
    allowedOrigins: parseAllowedOrigins(`${ORIGIN},http://localhost:5173`),
    now: () => now,
    // Orologio finto anche per il throttle: l'attesa fa avanzare il tempo.
    throttle: new UpstreamThrottle({
      minIntervalMs: 1_100,
      maxQueue: 2,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }),
  });
  const waitUntil = vi.fn();
  const call = (path: string, init: RequestInit & { origin?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    const origin = init.origin === undefined ? ORIGIN : init.origin;
    if (origin !== null) headers.set('Origin', origin);
    return gateway.handle(new Request(`https://gw.example${path}`, { ...init, headers }), {
      waitUntil,
    });
  };
  return {
    gateway,
    fetchFn,
    waitUntil,
    call,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function body(res: Response) {
  return (await res.json()) as AircraftResponse & Record<string, unknown>;
}

describe('GET /v1/aircraft', () => {
  it('200 con formato normalizzato, attribuzione ODbL e CORS', async () => {
    const t = setup();
    const res = await t.call('/v1/aircraft?lat=45.07&lon=7.69&r=240');
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('X-EarthRadar-Cache')).toBe('miss');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');

    const b = await body(res);
    expect(b).toMatchObject({
      v: 1,
      status: 'ok',
      reason: null,
      area: { lat: 45, lon: 7.5, radiusNm: 250 },
      requested: { lat: 45.07, lon: 7.69, radiusNm: 240 },
      providerTime: 1790510015501,
      cache: 'miss',
      count: 6,
    });
    expect(b.provider).toEqual(ADSB_LOL_INFO);
    expect(b.provider.license.id).toBe('ODbL-1.0');
    expect(b.provider.attribution).toMatch(/ADSB\.lol contributors/);
    expect(b.aircraft).toHaveLength(6);
    expect(t.fetchFn).toHaveBeenCalledWith(
      'https://api.adsb.lol/v2/point/45/7.5/250',
      expect.anything(),
    );
    expect(t.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('cache: seconda richiesta nella stessa area → hit, nessuna nuova chiamata', async () => {
    const t = setup();
    await t.call('/v1/aircraft?lat=45.07&lon=7.69&r=240');
    const res = await t.call('/v1/aircraft?lat=45.2&lon=7.6&r=200');
    expect((await body(res)).cache).toBe('hit');
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
    t.advance(10_000);
    await t.call('/v1/aircraft?lat=45.2&lon=7.6&r=200');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('coalescing: richieste concorrenti identiche → 1 chiamata upstream', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = setup(async () => {
      await gate;
      return new Response(JSON.stringify(fixture));
    });
    const pending = Array.from({ length: 5 }, () => t.call('/v1/aircraft?lat=45&lon=9&r=100'));
    release();
    const results = await Promise.all(pending.map(async (p) => body(await p)));
    expect(t.fetchFn).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.cache).sort()).toEqual([
      'coalesced',
      'coalesced',
      'coalesced',
      'coalesced',
      'miss',
    ]);
  });

  it('400 su parametri non validi, senza chiamare l’upstream', async () => {
    const t = setup();
    for (const qs of ['lat=45&lon=9&r=251', 'lat=45&lon=9&r=10.5', 'lat=95&lon=9&r=10', '']) {
      const res = await t.call(`/v1/aircraft?${qs}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ v: 1, error: 'invalid_params' });
    }
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('429 upstream → 503 rate_limited, breaker aperto, nessuna nuova chiamata', async () => {
    const t = setup(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '45' } }),
    );
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

    // Anche un'altra area: il breaker è globale per isolate.
    const again = await t.call('/v1/aircraft?lat=10&lon=10&r=25');
    expect(again.status).toBe(503);
    expect(await body(again)).toMatchObject({ status: 'rate_limited', cache: 'none' });
    expect(t.fetchFn).toHaveBeenCalledTimes(1);

    t.advance(45_000);
    await t.call('/v1/aircraft?lat=10&lon=10&r=25');
    expect(t.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('5xx upstream → 502 unavailable; timeout → 504', async () => {
    const t5 = setup(async () => new Response('', { status: 500 }));
    const r5 = await t5.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(r5.status).toBe(502);
    expect(await body(r5)).toMatchObject({ status: 'unavailable', reason: 'upstream_http_5xx' });

    const tn = setup(async () => {
      throw new TypeError('fetch failed');
    });
    const rn = await tn.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(rn.status).toBe(502);
    expect(await body(rn)).toMatchObject({ reason: 'upstream_network' });
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

  it('upstream invalido → 502 upstream_invalid, mai dati inventati', async () => {
    const t = setup(async () => new Response('<html>oops</html>'));
    const res = await t.call('/v1/aircraft?lat=45&lon=9&r=100');
    expect(res.status).toBe(502);
    expect(await body(res)).toMatchObject({ reason: 'upstream_invalid', aircraft: [], count: 0 });
  });
});

describe('CORS e metodi', () => {
  it('origine non consentita → 403 senza chiamare l’upstream', async () => {
    const t = setup();
    const res = await t.call('/v1/aircraft?lat=45&lon=9&r=100', { origin: 'https://evil.example' });
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
  it('riporta provider, attribuzione e stato breaker senza chiamare l’upstream', async () => {
    const t = setup();
    const res = await t.call('/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const b = (await res.json()) as Record<string, unknown>;
    expect(b).toMatchObject({
      v: 1,
      ok: true,
      service: 'earthradar-aircraft-gateway',
      scope: 'isolate',
      breaker: { open: false },
      lastUpstream: null,
    });
    expect(t.fetchFn).not.toHaveBeenCalled();
  });

  it('dopo un errore upstream riporta il breaker aperto', async () => {
    const t = setup(async () => new Response('', { status: 502 }));
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
