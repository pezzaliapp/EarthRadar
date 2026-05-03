import { describe, expect, it } from 'vitest';
import { parseStateVectorArray } from './openSkyApi';

const SV_VALID = [
  'a1b2c3', // 0 icao24
  'AZA123  ', // 1 callsign
  'Italy', // 2 origin_country
  1745000010, // 3 time_position
  1745000010, // 4 last_contact
  9.5, // 5 longitude
  45.4, // 6 latitude
  10500, // 7 baro_altitude
  false, // 8 on_ground
  240.0, // 9 velocity m/s
  87.5, // 10 true_track
  0, // 11 vertical_rate
  null, // 12 sensors
  10500, // 13 geo_altitude
  '1000', // 14 squawk
  false, // 15 spi
  0, // 16 position_source
];

describe('parseStateVectorArray', () => {
  it('returns [] for null/non-object/missing states', () => {
    expect(parseStateVectorArray(null)).toEqual([]);
    expect(parseStateVectorArray('nope')).toEqual([]);
    expect(parseStateVectorArray({})).toEqual([]);
    expect(parseStateVectorArray({ states: 'nope' })).toEqual([]);
  });

  it('parses a valid 17-field state vector into the typed Aircraft shape', () => {
    const out = parseStateVectorArray({ time: 1745000010, states: [SV_VALID] });
    expect(out).toHaveLength(1);
    const a = out[0];
    expect(a.icao24).toBe('a1b2c3');
    expect(a.callsign).toBe('AZA123');
    expect(a.originCountry).toBe('Italy');
    expect(a.lat).toBe(45.4);
    expect(a.lon).toBe(9.5);
    expect(a.baroAltM).toBe(10500);
    expect(a.geoAltM).toBe(10500);
    expect(a.velocityMs).toBe(240);
    expect(a.headingDeg).toBe(87.5);
    expect(a.verticalRateMs).toBe(0);
    expect(a.onGround).toBe(false);
    expect(a.squawk).toBe('1000');
    expect(a.positionSource).toBe(0);
  });

  it('drops state vectors with missing/invalid lat/lon or icao24', () => {
    const noCoords = [...SV_VALID];
    noCoords[5] = null;
    noCoords[6] = null;
    const noIcao = [...SV_VALID];
    noIcao[0] = '';
    const tooShort = SV_VALID.slice(0, 10);
    const out = parseStateVectorArray({ states: [noCoords, noIcao, tooShort, SV_VALID] });
    expect(out).toHaveLength(1);
    expect(out[0].icao24).toBe('a1b2c3');
  });

  it('handles null callsign and squawk gracefully', () => {
    const sv = [...SV_VALID];
    sv[1] = null;
    sv[14] = null;
    const out = parseStateVectorArray({ states: [sv] });
    expect(out[0].callsign).toBe('');
    expect(out[0].squawk).toBeNull();
  });
});
