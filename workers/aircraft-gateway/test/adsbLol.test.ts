// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADSB_LOL_INFO,
  buildPointUrl,
  createAdsbLolProvider,
  parseRetryAfterMs,
} from '../src/providers/adsbLol.ts';
import { UpstreamError } from '../src/providers/types.ts';
import fixture from './fixtures/adsblol-point.json';

const AREA = { lat: 45, lon: 7.5, radiusNm: 150 };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

async function expectUpstreamError(p: Promise<unknown>, kind: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UpstreamError);
  expect((err as UpstreamError).kind).toBe(kind);
  return err as UpstreamError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildPointUrl', () => {
  it('usa /v2/point con raggio intero', () => {
    expect(buildPointUrl('https://api.adsb.lol/', AREA)).toBe(
      'https://api.adsb.lol/v2/point/45/7.5/150',
    );
    expect(buildPointUrl('https://x', { lat: -33.5, lon: -70.25, radiusNm: 25 })).toBe(
      'https://x/v2/point/-33.5/-70.25/25',
    );
  });

  it('rifiuta raggi non interi o oltre 150 (difesa in profondità)', () => {
    expect(() => buildPointUrl('https://x', { ...AREA, radiusNm: 100.5 })).toThrow(RangeError);
    expect(() => buildPointUrl('https://x', { ...AREA, radiusNm: 151 })).toThrow(RangeError);
    expect(() => buildPointUrl('https://x', { ...AREA, radiusNm: 250 })).toThrow(RangeError);
    expect(() => buildPointUrl('https://x', { ...AREA, radiusNm: 0 })).toThrow(RangeError);
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

describe('createAdsbLolProvider.fetchArea', () => {
  it('chiama l’endpoint corretto con User-Agent e normalizza', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(fixture));
    const provider = createAdsbLolProvider({ baseUrl: 'https://api.adsb.lol', fetchFn });
    const r = await provider.fetchArea(AREA);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.adsb.lol/v2/point/45/7.5/150');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/EarthRadar/);
    expect(r.aircraft).toHaveLength(6);
    expect(r.upstreamBytes).toBeGreaterThan(0);
    expect(provider.info).toBe(ADSB_LOL_INFO);
  });

  it('token anonimi LADD/PIA stabili fra due aggiornamenti dello stesso provider', async () => {
    const provider = createAdsbLolProvider({ fetchFn: async () => jsonResponse(fixture) });
    const ids = async () =>
      (await provider.fetchArea(AREA)).aircraft
        .filter((a) => a.privacyRestricted)
        .map((a) => a.id)
        .sort();
    const first = await ids();
    expect(first).toHaveLength(2);
    expect(await ids()).toEqual(first);
  });

  it('429 → rate_limited con Retry-After', async () => {
    const fetchFn = vi.fn(
      async () => new Response('slow down', { status: 429, headers: { 'Retry-After': '90' } }),
    );
    const err = await expectUpstreamError(
      createAdsbLolProvider({ fetchFn }).fetchArea(AREA),
      'rate_limited',
    );
    expect(err.retryAfterMs).toBe(90_000);
    expect(err.httpStatus).toBe(429);
  });

  it('5xx e 4xx', async () => {
    await expectUpstreamError(
      createAdsbLolProvider({ fetchFn: async () => new Response('', { status: 503 }) }).fetchArea(
        AREA,
      ),
      'http_5xx',
    );
    await expectUpstreamError(
      createAdsbLolProvider({ fetchFn: async () => new Response('', { status: 403 }) }).fetchArea(
        AREA,
      ),
      'http_4xx',
    );
  });

  it('corpo non JSON o struttura errata → invalid', async () => {
    await expectUpstreamError(
      createAdsbLolProvider({ fetchFn: async () => new Response('<html>') }).fetchArea(AREA),
      'invalid',
    );
    await expectUpstreamError(
      createAdsbLolProvider({ fetchFn: async () => jsonResponse({ nope: true }) }).fetchArea(AREA),
      'invalid',
    );
  });

  it('errore di rete → network', async () => {
    await expectUpstreamError(
      createAdsbLolProvider({
        fetchFn: async () => {
          throw new TypeError('fetch failed');
        },
      }).fetchArea(AREA),
      'network',
    );
  });

  it('timeout → abort + timeout', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const p = createAdsbLolProvider({ fetchFn, timeoutMs: 6000 }).fetchArea(AREA);
    const assertion = expectUpstreamError(p, 'timeout');
    await vi.advanceTimersByTimeAsync(6000);
    await assertion;
  });
});
