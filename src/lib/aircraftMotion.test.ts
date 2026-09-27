import { describe, expect, it } from 'vitest';
import { renderAltitude, renderHeadingDeg } from './aircraftMotion';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

const base: GatewayAircraft = {
  id: 'abc123',
  icao24: 'abc123',
  callsign: null,
  registration: null,
  typeCode: null,
  lat: 45,
  lon: 9,
  onGround: false,
  altBaroM: null,
  altGeomM: null,
  groundSpeedMs: 250,
  trackDeg: null,
  verticalRateMs: null,
  squawk: null,
  emergency: null,
  positionSource: 'adsb',
  positionAgeS: 0,
  lastSeenS: 0,
  privacyRestricted: false,
};

describe('quota e rotta: nessun valore inventato', () => {
  it('quota null → ignota (nessun ripiego tipo 11 000 m)', () => {
    expect(renderAltitude(base)).toEqual({ kind: 'unknown', meters: null });
  });

  it('quota barometrica, poi geometrica', () => {
    expect(renderAltitude({ ...base, altBaroM: 10_000, altGeomM: 10_200 })).toEqual({
      kind: 'measured',
      meters: 10_000,
    });
    expect(renderAltitude({ ...base, altGeomM: 3_000 })).toEqual({
      kind: 'measured',
      meters: 3_000,
    });
  });

  it('a terra → rappresentato a terra, senza quota fittizia', () => {
    expect(renderAltitude({ ...base, onGround: true, altBaroM: null })).toEqual({
      kind: 'ground',
      meters: 0,
    });
  });

  it('rotta null → null (simbolo neutro), mai 0°', () => {
    expect(renderHeadingDeg(base)).toBeNull();
    expect(renderHeadingDeg({ ...base, trackDeg: 0 })).toBe(0);
    expect(renderHeadingDeg({ ...base, trackDeg: 255.7 })).toBe(255.7);
  });
});
