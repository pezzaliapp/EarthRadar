import { describe, expect, it } from 'vitest';
import { haversineKm, bearingDeg } from './geo';

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
