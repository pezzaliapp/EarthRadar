import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_MAX_DISPLAY_AGE_MS,
  aircraftView,
  initialAircraftFeedState,
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
  positionAgeS: 0,
  privacyRestricted: false,
};

function state(
  p: Partial<AircraftFeedState>,
  snap: Partial<GatewaySnapshot> | null = {},
): AircraftFeedState {
  return {
    ...initialAircraftFeedState,
    status: 'ok',
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

describe('aircraftView — freschezza, stale ed errori', () => {
  it('dati freschi → LIVE', () => {
    expect(aircraftView(state({}), T0 + 20_000)).toMatchObject({
      freshness: 'live',
      ageMs: 20_000,
    });
    expect(aircraftView(state({}), T0 + 20_000).aircraft).toHaveLength(1);
  });

  it('fotografia stale autorizzata dal gateway → mostrata, ma mai LIVE', () => {
    const v = aircraftView(state({ gatewayStale: true }), T0 + 5_000);
    expect(v.freshness).toBe('stale');
    expect(v.aircraft).toHaveLength(1);
  });

  it('errore dopo dati validi recenti → dati mostrati come stale, non LIVE', () => {
    const v = aircraftView(state({ status: 'error', error: 'upstream_429' }), T0 + 40_000);
    expect(v.freshness).toBe('stale');
    expect(v.aircraft).toHaveLength(1);
  });

  it('dati troppo vecchi → nessun aereo, "non disponibile" (nessun fallback)', () => {
    const v = aircraftView(state({ status: 'error' }), T0 + AIRCRAFT_MAX_DISPLAY_AGE_MS + 1);
    expect(v.freshness).toBe('unavailable');
    expect(v.aircraft).toEqual([]);
  });

  it('errore senza alcun dato → "non disponibile", lista vuota', () => {
    const v = aircraftView(state({ status: 'error' }, null), T0);
    expect(v).toMatchObject({ freshness: 'unavailable', aircraft: [] });
  });

  it('in caricamento → nessun aereo inventato', () => {
    expect(aircraftView(state({ status: 'loading' }, null), T0)).toMatchObject({
      freshness: 'loading',
      aircraft: [],
    });
  });

  it('layer spento → off', () => {
    expect(aircraftView({ ...initialAircraftFeedState }, T0).freshness).toBe('off');
  });

  it('array vuoto stabile (niente re-render a catena)', () => {
    const a = aircraftView(state({ status: 'error' }, null), T0).aircraft;
    const b = aircraftView(state({ status: 'error' }, null), T0 + 1).aircraft;
    expect(a).toBe(b);
  });
});
