import { describe, expect, it } from 'vitest';
import {
  groundTrack,
  groundTrackSatrec,
  orbitalElements,
  parseGpRecord,
  parseTle,
  parseTleList,
  propagate,
  propagateSatrec,
  tleToSatrec,
} from './sgp4Lite';

// TLE ISS al 2026-04-25T12:00 UTC (epoch fissato, comodo per assert deterministici).
const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26115.50000000  .00012345  00000-0  22678-3 0  9990',
  line2: '2 25544  51.6420 200.0000 0001234  10.0000 350.0000 15.50000000400000',
};

describe('parseTle', () => {
  it('parses a valid 3-line TLE', () => {
    const text = `${ISS_TLE.name}\n${ISS_TLE.line1}\n${ISS_TLE.line2}`;
    const out = parseTle(text);
    expect(out).toEqual(ISS_TLE);
  });

  it('returns null on too few lines', () => {
    expect(parseTle('only one line')).toBeNull();
    expect(parseTle('')).toBeNull();
  });

  it('rejects when line 1/2 prefixes are wrong', () => {
    expect(parseTle('NAME\nx not tle\ny not tle')).toBeNull();
  });

  it('parseTleList handles multiple records', () => {
    const text = `A\n${ISS_TLE.line1}\n${ISS_TLE.line2}\nB\n${ISS_TLE.line1}\n${ISS_TLE.line2}`;
    expect(parseTleList(text)).toHaveLength(2);
  });
});

describe('parseGpRecord', () => {
  it('roundtrips GP record with explicit TLE_LINE1/2', () => {
    const tle = parseGpRecord({
      OBJECT_NAME: 'ISS (ZARYA)',
      NORAD_CAT_ID: 25544,
      TLE_LINE1: ISS_TLE.line1,
      TLE_LINE2: ISS_TLE.line2,
    });
    expect(tle?.line1).toBe(ISS_TLE.line1);
    expect(tle?.line2).toBe(ISS_TLE.line2);
  });

  it('builds TLE from GP-JSON fields when TLE_LINE1/2 absent', () => {
    const tle = parseGpRecord({
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
    });
    expect(tle).not.toBeNull();
    expect(tle!.line1).toMatch(/^1 25544/);
    expect(tle!.line2).toMatch(/^2 25544/);
    // satellite.js deve accettare il TLE ricostruito
    const sat = tleToSatrec(tle!);
    expect(sat.error).toBe(0);
  });

  it('returns null when required fields missing', () => {
    expect(parseGpRecord({ OBJECT_NAME: 'X' })).toBeNull();
  });
});

describe('propagate', () => {
  it('returns sane lat/lon/alt for ISS', () => {
    const p = propagate(ISS_TLE, new Date('2026-04-25T12:00:00Z'));
    expect(p).not.toBeNull();
    expect(Math.abs(p!.lat)).toBeLessThanOrEqual(90);
    expect(Math.abs(p!.lon)).toBeLessThanOrEqual(180);
    // ISS è in LEO ~ 380-430 km
    expect(p!.alt).toBeGreaterThan(300);
    expect(p!.alt).toBeLessThan(500);
    expect(p!.velocityKms).toBeGreaterThan(7);
    expect(p!.velocityKms).toBeLessThan(8);
  });

  it('matches propagateSatrec on the same input', () => {
    const date = new Date('2026-04-25T13:00:00Z');
    const sat = tleToSatrec(ISS_TLE);
    const a = propagate(ISS_TLE, date);
    const b = propagateSatrec(sat, date);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a!.lat - b!.lat)).toBeLessThan(1e-9);
    expect(Math.abs(a!.lon - b!.lon)).toBeLessThan(1e-9);
    expect(Math.abs(a!.alt - b!.alt)).toBeLessThan(1e-9);
  });

  it('produces points within ~10 km tolerance vs reference (sanity)', () => {
    // Sanity: due propagazioni a +1s di distanza distano ~7-8 km (velocità ISS)
    const t0 = new Date('2026-04-25T12:00:00Z');
    const t1 = new Date('2026-04-25T12:00:01Z');
    const sat = tleToSatrec(ISS_TLE);
    const p0 = propagateSatrec(sat, t0)!;
    const p1 = propagateSatrec(sat, t1)!;
    // Distanza approssimata in km via lat/lon (rough — non haversine, basta come sanity)
    const dLat = (p1.lat - p0.lat) * 111;
    const dLon = (p1.lon - p0.lon) * 111 * Math.cos((p0.lat * Math.PI) / 180);
    const dKm = Math.sqrt(dLat * dLat + dLon * dLon);
    expect(dKm).toBeGreaterThan(5);
    expect(dKm).toBeLessThan(10);
  });
});

describe('groundTrack', () => {
  it('groundTrackSatrec returns expected sample count for 90min/30s', () => {
    const sat = tleToSatrec(ISS_TLE);
    const samples = groundTrackSatrec(sat, new Date('2026-04-25T12:00:00Z'), 90, 30);
    // 90 min × 60 / 30 = 180 step + endpoint = 181 sample (a meno di SGP4 fail)
    expect(samples.length).toBeGreaterThan(170);
    expect(samples.length).toBeLessThanOrEqual(181);
    for (const s of samples) {
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lon)).toBeLessThanOrEqual(180);
      expect(s.t).toBeGreaterThan(0);
    }
  });

  it('groundTrack legacy signature returns same first/last as Satrec variant', () => {
    const from = Date.UTC(2026, 3, 25, 12, 0, 0);
    const to = from + 90 * 60_000;
    const a = groundTrack(ISS_TLE, from, to, 30);
    const sat = tleToSatrec(ISS_TLE);
    const b = groundTrackSatrec(sat, new Date(from), 90, 30);
    expect(a).toHaveLength(b.length);
    expect(a[0].lat).toBeCloseTo(b[0].lat, 8);
    expect(a[a.length - 1].lon).toBeCloseTo(b[b.length - 1].lon, 8);
  });
});

describe('orbitalElements', () => {
  it('extracts expected values for ISS', () => {
    const sat = tleToSatrec(ISS_TLE);
    const el = orbitalElements(sat);
    expect(el.inclinationDeg).toBeCloseTo(51.642, 1);
    expect(el.eccentricity).toBeCloseTo(0.0001234, 6);
    expect(el.meanMotionRevPerDay).toBeCloseTo(15.5, 2);
    expect(el.periodMinutes).toBeGreaterThan(91);
    expect(el.periodMinutes).toBeLessThan(94);
    // Perigeo e apogeo entro la fascia LEO ISS
    expect(el.perigeeKm).toBeGreaterThan(350);
    expect(el.perigeeKm).toBeLessThan(450);
    expect(el.apogeeKm).toBeGreaterThan(350);
    expect(el.apogeeKm).toBeLessThan(450);
    // Semi-asse maggiore Terra+~400 km
    expect(el.semiMajorAxisKm).toBeGreaterThan(6700);
    expect(el.semiMajorAxisKm).toBeLessThan(6900);
  });
});
