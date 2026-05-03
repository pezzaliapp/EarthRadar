import { describe, expect, it } from 'vitest';
import { parseGpJsonArray } from './celestrakApi';

const ISS_GP = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-04-25T12:00:00.000',
  MEAN_MOTION: 15.5,
  ECCENTRICITY: 0.0001234,
  INCLINATION: 51.642,
  RA_OF_ASC_NODE: 200.0,
  ARG_OF_PERICENTER: 10.0,
  MEAN_ANOMALY: 350.0,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 40000,
  BSTAR: 0.00022678,
  MEAN_MOTION_DOT: 0.00012345,
  MEAN_MOTION_DDOT: 0,
  TLE_LINE0: 'ISS (ZARYA)',
  TLE_LINE1: '1 25544U 98067A   26115.50000000  .00012345  00000-0  22678-3 0  9990',
  TLE_LINE2: '2 25544  51.6420 200.0000 0001234  10.0000 350.0000 15.50000000400000',
};

describe('parseGpJsonArray', () => {
  it('returns [] on non-array input', () => {
    expect(parseGpJsonArray(null, 'stations')).toEqual([]);
    expect(parseGpJsonArray({ data: [] }, 'stations')).toEqual([]);
    expect(parseGpJsonArray('nope', 'stations')).toEqual([]);
  });

  it('parses a single ISS GP record into a SatelliteRecord', () => {
    const out = parseGpJsonArray([ISS_GP], 'stations');
    expect(out).toHaveLength(1);
    const r = out[0];
    expect(r.noradId).toBe(25544);
    expect(r.name).toBe('ISS (ZARYA)');
    expect(r.tle.line1).toBe(ISS_GP.TLE_LINE1);
    expect(r.tle.line2).toBe(ISS_GP.TLE_LINE2);
    expect(r.group).toBe('stations');
  });

  it('drops malformed records without throwing', () => {
    const out = parseGpJsonArray(
      [
        ISS_GP,
        { OBJECT_NAME: 'broken', NORAD_CAT_ID: null }, // invalid
        null,
        { OBJECT_NAME: 'no-norad' },
      ],
      'stations',
    );
    expect(out).toHaveLength(1);
    expect(out[0].noradId).toBe(25544);
  });

  it('attaches the supplied group label', () => {
    const out = parseGpJsonArray([ISS_GP], 'starlink');
    expect(out[0].group).toBe('starlink');
  });
});
