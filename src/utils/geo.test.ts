import { describe, expect, it } from 'vitest';
import { haversineKm, bearingDeg, pointAtDistance, compassGrid } from './geo';

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

describe('pointAtDistance', () => {
  it('returns a point at exact great-circle distance', () => {
    const p = pointAtDistance(45, 9, 90, 100);
    const d = haversineKm(45, 9, p.lat, p.lon);
    expect(d).toBeCloseTo(100, 0);
  });

  it('handles 360° wraparound around the meridian', () => {
    const p = pointAtDistance(0, 179.5, 90, 100);
    expect(p.lon).toBeLessThan(0); // dovrebbe wrappare verso longitudini negative
  });
});

describe('compassGrid', () => {
  it('produces 8 cells, each at the requested distance from center', () => {
    const grid = compassGrid(45, 9, 100);
    expect(grid).toHaveLength(8);
    expect(grid.map((c) => c.key)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
    for (const c of grid) {
      const d = haversineKm(45, 9, c.lat, c.lon);
      expect(d).toBeCloseTo(100, 0);
    }
  });

  it('north cell has higher latitude, south cell has lower', () => {
    const grid = compassGrid(45, 9, 100);
    const n = grid.find((c) => c.key === 'N')!;
    const s = grid.find((c) => c.key === 'S')!;
    expect(n.lat).toBeGreaterThan(45);
    expect(s.lat).toBeLessThan(45);
  });
});
