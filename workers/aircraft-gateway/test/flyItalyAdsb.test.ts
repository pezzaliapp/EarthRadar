// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAreaUrl,
  createFlyItalyAdsbProvider,
  FLY_ITALY_ADSB_INFO,
  nmToKm,
  parseRetryAfterMs,
} from '../src/providers/flyItalyAdsb.ts';
import { UpstreamError } from '../src/providers/types.ts';
import fixture from './fixtures/readsb-point.json';

const AREA = { lat: 45, lon: 7.5, radiusNm: 150 };
/** Chiave FINTA, solo per i test: la chiave reale vive esclusivamente nei secret Cloudflare. */
const FAKE_KEY = 'test-fake-key-not-a-real-secret';
const BASE = 'https://api.flyitalyadsb.com/v2';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function provider(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, extra = {}) {
  return createFlyItalyAdsbProvider({
    apiKey: FAKE_KEY,
    fetchFn: fetchFn as unknown as typeof fetch,
    ...extra,
  });
}

async function expectUpstreamError(p: Promise<unknown>, kind: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).kind).toBe(kind);
  // Nessun messaggio d'errore contiene la chiave.
  expect((err as Error).message).not.toContain(FAKE_KEY);
  return err as UpstreamError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('conversione NM → km e URL', () => {
  it('km = NM × 1,852 arrotondati per eccesso', () => {
    expect(nmToKm(25)).toBe(47); // 46,3
    expect(nmToKm(50)).toBe(93); // 92,6
    expect(nmToKm(100)).toBe(186); // 185,2
    expect(nmToKm(150)).toBe(278); // 277,8
  });

  it('usa /lat/{lat}/lon/{lon}/dist/{km}, senza chiave nell’URL', () => {
    expect(buildAreaUrl(`${BASE}/`, AREA)).toBe(`${BASE}/lat/45/lon/7.5/dist/278`);
    expect(buildAreaUrl('https://x', { lat: -33.5, lon: -70.25, radiusNm: 25 })).toBe(
      'https://x/lat/-33.5/lon/-70.25/dist/47',
    );
  });

  it('rifiuta raggi non interi o oltre 150 NM (difesa in profondità)', () => {
    expect(() => buildAreaUrl('https://x', { ...AREA, radiusNm: 100.5 })).toThrow(RangeError);
    expect(() => buildAreaUrl('https://x', { ...AREA, radiusNm: 151 })).toThrow(RangeError);
    expect(() => buildAreaUrl('https://x', { ...AREA, radiusNm: 0 })).toThrow(RangeError);
  });
});

describe('parseRetryAfterMs', () => {
  it('secondi e data HTTP', () => {
    expect(parseRetryAfterMs('120', 0)).toBe(120_000);
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(parseRetryAfterMs('Sun, 27 Sep 2026 12:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfterMs('boh', now)).toBeNull();
    expect(parseRetryAfterMs(null, now)).toBeNull();
  });
});

describe('createFlyItalyAdsbProvider.fetchArea', () => {
  it('chiama l’endpoint in km con X-Api-Key e User-Agent, e normalizza', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(fixture));
    const p = provider(fetchFn);
    const r = await p.fetchArea(AREA);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/lat/45/lon/7.5/dist/278`);
    expect(url).not.toContain(FAKE_KEY);
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe(FAKE_KEY);
    expect(headers['User-Agent']).toMatch(/EarthRadar/);
    expect(r.aircraft).toHaveLength(6);
    expect(r.upstreamBytes).toBeGreaterThan(0);
    expect(p.info).toBe(FLY_ITALY_ADSB_INFO);
    // Il risultato (che finisce nella risposta pubblica) non contiene la chiave.
    expect(JSON.stringify(r)).not.toContain(FAKE_KEY);
  });

  it('attribuzione CC BY-SA 4.0, nessun riferimento a ADSB.lol', () => {
    expect(FLY_ITALY_ADSB_INFO).toMatchObject({
      id: 'flyitalyadsb',
      name: 'FlyItalyADSB',
      url: 'https://flyitalyadsb.com/',
      license: { id: 'CC-BY-SA-4.0' },
    });
    expect(FLY_ITALY_ADSB_INFO.attribution).toMatch(/FlyItalyADSB.*CC BY-SA 4\.0/);
    expect(JSON.stringify(FLY_ITALY_ADSB_INFO).toLowerCase()).not.toContain('adsb.lol');
  });

  it('senza chiave → not_configured, nessuna chiamata upstream', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(fixture));
    for (const apiKey of [undefined, '', '   ']) {
      await expectUpstreamError(
        createFlyItalyAdsbProvider({
          apiKey,
          fetchFn: fetchFn as unknown as typeof fetch,
        }).fetchArea(AREA),
        'not_configured',
      );
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('token anonimi LADD/PIA stabili fra due aggiornamenti dello stesso provider', async () => {
    const p = provider(async () => jsonResponse(fixture));
    const ids = async () =>
      (await p.fetchArea(AREA)).aircraft
        .filter((a) => a.privacyRestricted)
        .map((a) => a.id)
        .sort();
    const first = await ids();
    expect(first).toHaveLength(2);
    expect(await ids()).toEqual(first);
  });

  it('429 → rate_limited con Retry-After', async () => {
    const err = await expectUpstreamError(
      provider(
        async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '90' } }),
      ).fetchArea(AREA),
      'rate_limited',
    );
    expect(err.retryAfterMs).toBe(90_000);
    expect(err.httpStatus).toBe(429);
  });

  it('401/403 → http_4xx con lo status esatto; 5xx → http_5xx', async () => {
    for (const status of [401, 403]) {
      const err = await expectUpstreamError(
        provider(async () => new Response('{"error":"invalid key"}', { status })).fetchArea(AREA),
        'http_4xx',
      );
      expect(err.httpStatus).toBe(status);
    }
    await expectUpstreamError(
      provider(async () => new Response('', { status: 503 })).fetchArea(AREA),
      'http_5xx',
    );
  });

  it('corpo non JSON o struttura errata → invalid', async () => {
    await expectUpstreamError(
      provider(async () => new Response('<html>')).fetchArea(AREA),
      'invalid',
    );
    await expectUpstreamError(
      provider(async () => jsonResponse({ nope: true })).fetchArea(AREA),
      'invalid',
    );
  });

  it('errore di rete → network, senza dettagli della richiesta nel messaggio', async () => {
    const err = await expectUpstreamError(
      provider(async () => {
        throw new TypeError(`fetch failed X-Api-Key: ${FAKE_KEY}`);
      }).fetchArea(AREA),
      'network',
    );
    expect(err.message).toBe('FlyItalyADSB network error');
  });

  it('timeout → abort + timeout', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const p = provider(fetchFn, { timeoutMs: 6000 }).fetchArea(AREA);
    const assertion = expectUpstreamError(p, 'timeout');
    await vi.advanceTimersByTimeAsync(6000);
    await assertion;
  });
});
