import { describe, expect, it, vi } from 'vitest';
import {
  AIRCRAFT_GATEWAY_URL,
  buildAircraftUrl,
  fetchAircraftArea,
  parseGatewaySnapshot,
  parseRetryAfterMs,
} from './aircraftGatewayApi';

const PROVIDER = {
  id: 'flyitalyadsb',
  name: 'FlyItalyADSB',
  url: 'https://flyitalyadsb.com/',
  attribution: 'Aircraft data: FlyItalyADSB (flyitalyadsb.com) · ADS-B/MLAT data · CC BY-SA 4.0',
  license: {
    id: 'CC-BY-SA-4.0',
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

function gatewayBody(aircraft: unknown[], extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    status: 'ok',
    reason: null,
    provider: PROVIDER,
    area: { lat: 44.5, lon: 10.5, radiusNm: 150 },
    providerTime: 1790526116293,
    fetchedAt: 1790526116315,
    ttlS: 30,
    retryAfterS: null,
    count: aircraft.length,
    stats: null,
    aircraft,
    ...extra,
  };
}

const PLANE = {
  id: '020095',
  icao24: '020095',
  callsign: 'RAM953Q',
  registration: 'CN-ROU',
  typeCode: 'B738',
  category: 'A3',
  lat: 44.5402,
  lon: 10.77344,
  onGround: false,
  altBaroM: 5304,
  altGeomM: 5585,
  groundSpeedMs: 185.3,
  trackDeg: 255.7,
  trackSource: 'track',
  verticalRateMs: 12.35,
  squawk: '3744',
  emergency: null,
  positionSource: 'adsb',
  positionAgeS: 0.4,
  lastSeenS: 0.2,
  privacyRestricted: false,
};

describe('parseGatewaySnapshot — contratto v1 del gateway', () => {
  it('legge metadati e aerei', () => {
    const s = parseGatewaySnapshot(gatewayBody([PLANE]));
    expect(s).not.toBeNull();
    expect(s?.provider.name).toBe('FlyItalyADSB');
    expect(s?.provider.attribution).toMatch(/CC BY-SA 4\.0/);
    expect(s).toMatchObject({ providerTime: 1790526116293, fetchedAt: 1790526116315, ttlS: 30 });
    expect(s?.aircraft[0]).toMatchObject({
      id: '020095',
      icao24: '020095',
      callsign: 'RAM953Q',
      registration: 'CN-ROU',
      altBaroM: 5304,
      trackDeg: 255.7,
      groundSpeedMs: 185.3,
      verticalRateMs: 12.35,
      onGround: false,
      privacyRestricted: false,
      // Età della singola posizione e dell'ultimo messaggio, se il provider le fornisce.
      positionAgeS: 0.4,
      lastSeenS: 0.2,
    });
  });

  it('campi assenti restano null: nessuna quota, rotta o velocità inventata', () => {
    const s = parseGatewaySnapshot(
      gatewayBody([
        {
          id: 'abc123',
          lat: 45,
          lon: 9,
          onGround: false,
          altBaroM: null,
          trackDeg: null,
          privacyRestricted: false,
        },
      ]),
    );
    expect(s?.aircraft[0]).toMatchObject({
      altBaroM: null,
      altGeomM: null,
      trackDeg: null,
      groundSpeedMs: null,
      verticalRateMs: null,
      callsign: null,
    });
  });

  it('LADD/PIA: solo id anonimo, mai identificativi anche se presenti per errore', () => {
    const s = parseGatewaySnapshot(
      gatewayBody([
        {
          ...PLANE,
          id: 'anon-2f997e687425',
          icao24: '3c1234',
          callsign: 'PRIV01',
          registration: 'D-PRIV',
          privacyRestricted: true,
        },
      ]),
    );
    expect(s?.aircraft[0]).toMatchObject({
      id: 'anon-2f997e687425',
      icao24: null,
      callsign: null,
      registration: null,
      privacyRestricted: true,
    });
  });

  it('scarta aerei senza id o con coordinate non valide', () => {
    const s = parseGatewaySnapshot(
      gatewayBody([
        { ...PLANE, id: '' },
        { ...PLANE, id: 'x1', lat: 95 },
        { ...PLANE, id: 'x2', lon: null },
        PLANE,
      ]),
    );
    expect(s?.aircraft.map((a) => a.id)).toEqual(['020095']);
  });

  it('rifiuta corpi non validi o di errore', () => {
    expect(parseGatewaySnapshot(null)).toBeNull();
    expect(parseGatewaySnapshot({ v: 1, status: 'rate_limited', aircraft: [] })).toBeNull();
    expect(parseGatewaySnapshot(gatewayBody([], { fetchedAt: null }))).toBeNull();
    expect(parseGatewaySnapshot(gatewayBody([], { v: 2 }))).toBeNull();
  });
});

describe('fetchAircraftArea', () => {
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, ...init });

  it('chiama SOLO il gateway, con r ≤ 150 NM', async () => {
    const fetchFn = vi.fn(async () => json(gatewayBody([PLANE])));
    const r = await fetchAircraftArea(
      { lat: 44.698, lon: 10.631, radiusNm: 400 },
      { fetchFn: fetchFn as unknown as typeof fetch },
    );
    const url = (fetchFn.mock.calls[0] as unknown as [string])[0];
    expect(url.startsWith(`${AIRCRAFT_GATEWAY_URL}?`)).toBe(true);
    expect(url).toContain('r=150');
    expect(url).not.toMatch(/flyitalyadsb|opensky|api[-_]?key/i);
    // Mai dalla cache HTTP del browser: l'età (Age) deve arrivare dal gateway.
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].cache).toBe('no-cache');
    expect(r.kind).toBe('ok');
  });

  it('fotografia stale del gateway → ok ma marcata stale', async () => {
    const r = await fetchAircraftArea(
      { lat: 45, lon: 9, radiusNm: 50 },
      {
        fetchFn: (async () =>
          json(gatewayBody([PLANE]), {
            headers: { 'X-EarthRadar-Cache': 'stale', 'Retry-After': '30' },
          })) as unknown as typeof fetch,
      },
    );
    expect(r).toMatchObject({ kind: 'ok', gatewayStale: true, retryAfterMs: 30_000 });
  });

  it('header Age → età della fotografia misurata dal gateway', async () => {
    const r = await fetchAircraftArea(
      { lat: 45, lon: 9, radiusNm: 50 },
      {
        fetchFn: (async () =>
          json(gatewayBody([PLANE]), { headers: { Age: '29' } })) as unknown as typeof fetch,
      },
    );
    expect(r).toMatchObject({ kind: 'ok', ageMs: 29_000 });
    const noAge = await fetchAircraftArea(
      { lat: 45, lon: 9, radiusNm: 50 },
      { fetchFn: (async () => json(gatewayBody([PLANE]))) as unknown as typeof fetch },
    );
    expect(noAge).toMatchObject({ kind: 'ok', ageMs: null });
  });

  it('errore del gateway → error con Retry-After e motivo', async () => {
    const r = await fetchAircraftArea(
      { lat: 45, lon: 9, radiusNm: 50 },
      {
        fetchFn: (async () =>
          json(
            { v: 1, status: 'rate_limited', reason: 'upstream_429', aircraft: [] },
            { status: 503, headers: { 'Retry-After': '45' } },
          )) as unknown as typeof fetch,
      },
    );
    expect(r).toEqual({
      kind: 'error',
      httpStatus: 503,
      reason: 'upstream_429',
      retryAfterMs: 45_000,
    });
  });

  it('errore di rete → error senza dati', async () => {
    const r = await fetchAircraftArea(
      { lat: 45, lon: 9, radiusNm: 50 },
      {
        fetchFn: (async () => {
          throw new TypeError('offline');
        }) as unknown as typeof fetch,
      },
    );
    expect(r).toMatchObject({ kind: 'error', httpStatus: null, reason: 'network' });
  });
});

describe('helper', () => {
  it('buildAircraftUrl: 4 decimali, raggio limitato a [1, 150]', () => {
    expect(buildAircraftUrl(44.698123, 10.631987, 50)).toBe(
      `${AIRCRAFT_GATEWAY_URL}?lat=44.6981&lon=10.632&r=50`,
    );
    expect(buildAircraftUrl(0, 0, 0)).toContain('r=1');
    expect(buildAircraftUrl(0, 0, 999)).toContain('r=150');
  });

  it('parseRetryAfterMs: secondi, data HTTP, valori non validi', () => {
    expect(parseRetryAfterMs('120', 0)).toBe(120_000);
    const now = Date.parse('2026-09-27T12:00:00Z');
    expect(parseRetryAfterMs('Sun, 27 Sep 2026 12:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfterMs('x', now)).toBeNull();
    expect(parseRetryAfterMs(null, now)).toBeNull();
  });
});
