import { describe, expect, it } from 'vitest';
import { haversineKm, bearingDeg, projectAhead } from './geo';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(45, 9, 45, 9)).toBe(0);
  });

  it('approximates Reggio Emilia → Roma at ~358 km', () => {
    // RE 44.698, 10.631 → Roma 41.9028, 12.4964
    const d = haversineKm(44.698, 10.631, 41.9028, 12.4964);
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(380);
  });

  it('is symmetric', () => {
    const ab = haversineKm(0, 0, 30, 60);
    const ba = haversineKm(30, 60, 0, 0);
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe('bearingDeg', () => {
  it('returns ~90° due east for nearby points', () => {
    const b = bearingDeg(0, 0, 0, 1);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });

  it('returns 0 ≤ bearing < 360', () => {
    const b = bearingDeg(45, 9, 0, 0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('projectAhead', () => {
  it('projecting due east at 240 m/s for 30s lands ~7.2 km east on the equator', () => {
    const start = { lat: 0, lon: 0 };
    const end = projectAhead(start.lat, start.lon, 90, 240, 30);
    // 240 m/s × 30 s = 7200 m = 7.2 km. 1° lon ≈ 111 km a equatore → 7.2/111 ≈ 0.0648°
    expect(end.lat).toBeCloseTo(0, 2);
    expect(end.lon).toBeCloseTo(0.0648, 3);
    const d = haversineKm(start.lat, start.lon, end.lat, end.lon);
    expect(d).toBeCloseTo(7.2, 1);
  });

  it('projecting due north at 100 m/s for 60s moves the latitude', () => {
    const end = projectAhead(45, 9, 0, 100, 60);
    expect(end.lat).toBeGreaterThan(45);
    const dKm = haversineKm(45, 9, end.lat, end.lon);
    expect(dKm).toBeCloseTo(6, 1); // 100*60/1000 = 6 km
  });

  it('zero speed returns the same point', () => {
    const end = projectAhead(45, 9, 90, 0, 60);
    expect(end.lat).toBeCloseTo(45, 8);
    expect(end.lon).toBeCloseTo(9, 8);
  });
});
