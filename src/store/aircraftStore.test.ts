import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_MAX_DISPLAY_AGE_MS,
  aircraftView,
  initialAircraftFeedState,
  positionAgeNowS,
  replayTimeMs,
  serverNowMs,
  snapshotAgeMs,
  type AircraftFeedState,
} from './aircraftStore';
import type { GatewayAircraft, GatewaySnapshot } from '@/services/aircraftGatewayApi';

const T0 = 1_790_526_000_000;

const plane: GatewayAircraft = {
  id: '020095',
  icao24: '020095',
  callsign: 'RAM953Q',
  registration: 'CN-ROU',
  typeCode: 'B738',
  lat: 44.54,
  lon: 10.77,
  onGround: false,
  altBaroM: 5304,
  altGeomM: 5585,
  groundSpeedMs: 185.3,
  trackDeg: 255.7,
  verticalRateMs: 12.35,
  squawk: null,
  emergency: null,
  positionSource: 'adsb',
  positionAgeS: 2,
  lastSeenS: 0.5,
  privacyRestricted: false,
};

/** Fotografia con fetchedAt = T0 ricevuta al tempo locale `receivedAt` con età `ageAtReceiptMs`. */
function state(
  p: Partial<AircraftFeedState>,
  snap: Partial<GatewaySnapshot> | null = {},
): AircraftFeedState {
  return {
    ...initialAircraftFeedState,
    status: 'ok',
    receivedAt: T0,
    ageAtReceiptMs: 0,
    snapshot:
      snap === null
        ? null
        : {
            provider: {
              id: 'flyitalyadsb',
              name: 'FlyItalyADSB',
              url: '',
              attribution: '',
              license: { id: '', name: '', url: '' },
            },
            area: { lat: 44.5, lon: 10.5, radiusNm: 150 },
            providerTime: T0,
            fetchedAt: T0,
            ttlS: 30,
            aircraft: [plane],
            ...snap,
          },
    ...p,
  };
}

describe('età della fotografia', () => {
  it('= Age alla ricezione + tempo trascorso sul browser', () => {
    expect(snapshotAgeMs(state({ ageAtReceiptMs: 12_000 }), T0 + 3_000)).toBe(15_000);
  });

  it('indipendente dall’orologio del client (anche se sfasato di minuti)', () => {
    // Browser indietro di 5 minuti: receivedAt e now sul suo orologio.
    const skewed = state({ receivedAt: T0 - 300_000, ageAtReceiptMs: 4_000 });
    expect(snapshotAgeMs(skewed, T0 - 300_000 + 1_000)).toBe(5_000);
    expect(serverNowMs(skewed, T0 - 300_000 + 1_000)).toBe(T0 + 5_000);
  });

  it('istante di replay = orologio del gateway − (ttl + 5 s)', () => {
    expect(replayTimeMs(state({}), T0 + 10_000)).toBe(T0 + 10_000 - 35_000);
  });
});

describe('aircraftView — LIVE / ritardo / non disponibile', () => {
  it('fotografia ≤ ttl + 5 s → LIVE', () => {
    expect(aircraftView(state({}), T0 + 35_000).freshness).toBe('live');
    expect(aircraftView(state({}), T0 + 20_000).aircraft).toHaveLength(1);
  });

  it('oltre ttl + 5 s → "ritardo", mai LIVE', () => {
    const v = aircraftView(state({}), T0 + 35_001);
    expect(v.freshness).toBe('delayed');
    expect(v.ageMs).toBe(35_001);
    expect(v.aircraft).toHaveLength(1);
  });

  it('fotografia stale autorizzata dal gateway → ritardo, mai LIVE', () => {
    expect(aircraftView(state({ gatewayStale: true }), T0 + 1_000).freshness).toBe('delayed');
  });

  it('errore dopo dati recenti → ritardo', () => {
    expect(aircraftView(state({ status: 'error' }), T0 + 10_000).freshness).toBe('delayed');
  });

  it('oltre 150 s → nessun aereo, "non disponibile" (nessun fallback)', () => {
    const v = aircraftView(state({ status: 'error' }), T0 + AIRCRAFT_MAX_DISPLAY_AGE_MS + 1);
    expect(v.freshness).toBe('unavailable');
    expect(v.aircraft).toEqual([]);
  });

  it('errore senza alcun dato → "non disponibile"', () => {
    expect(aircraftView(state({ status: 'error' }, null), T0)).toMatchObject({
      freshness: 'unavailable',
      aircraft: [],
    });
  });

  it('in caricamento / layer spento', () => {
    expect(aircraftView(state({ status: 'loading' }, null), T0).freshness).toBe('loading');
    expect(aircraftView({ ...initialAircraftFeedState }, T0).freshness).toBe('off');
  });

  it('array vuoto stabile (niente re-render a catena)', () => {
    const a = aircraftView(state({ status: 'error' }, null), T0).aircraft;
    const b = aircraftView(state({ status: 'error' }, null), T0 + 1).aircraft;
    expect(a).toBe(b);
  });
});

describe('età della SINGOLA posizione (distinta da quella della fotografia)', () => {
  it('= età fotografia + (fetchedAt − providerTime) + seen_pos', () => {
    // Fotografia di 10 s, posizione rilevata 2 s prima del tempo del provider.
    expect(positionAgeNowS(plane, state({ ageAtReceiptMs: 10_000 }), T0)).toBeCloseTo(12, 6);
  });

  it('seen_pos assente → età sconosciuta', () => {
    expect(positionAgeNowS({ ...plane, positionAgeS: null }, state({}), T0)).toBeNull();
  });
});
