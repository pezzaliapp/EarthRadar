import { describe, expect, it } from 'vitest';
import {
  filterInRange,
  isSwept,
  normalizeAngle,
  polarToCanvas,
  RADAR_RANGES,
  toPolar,
} from './radarPolar';

describe('toPolar', () => {
  it('returns range 0 e bearing 0 sul centro stesso', () => {
    const p = toPolar(45, 10, 45, 10, 100);
    expect(p.rangeKm).toBeCloseTo(0, 6);
    expect(p.rangeNorm).toBeCloseTo(0, 6);
    expect(p.inRange).toBe(true);
  });

  it('punto a Nord: bearing ~ 0°', () => {
    const p = toPolar(45, 10, 45.5, 10, 1000);
    expect(p.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(p.bearingDeg).toBeLessThan(2);
    expect(p.inRange).toBe(true);
  });

  it('punto a Est: bearing ~ 90°', () => {
    const p = toPolar(45, 10, 45, 10.5, 1000);
    expect(p.bearingDeg).toBeGreaterThan(88);
    expect(p.bearingDeg).toBeLessThan(92);
  });

  it('inRange = false oltre il raggio', () => {
    // ~ 111 km di latitudine
    const p = toPolar(45, 10, 46, 10, 100);
    expect(p.rangeKm).toBeGreaterThan(100);
    expect(p.inRange).toBe(false);
    expect(p.rangeNorm).toBeGreaterThan(1);
  });

  it('rangeNorm scala linearmente nel raggio', () => {
    const r100 = toPolar(45, 10, 45.45, 10, 100); // ~50 km
    const r500 = toPolar(45, 10, 45.45, 10, 500);
    expect(r100.rangeNorm).toBeGreaterThan(r500.rangeNorm);
    expect(r500.rangeNorm).toBeLessThan(0.2);
  });
});

describe('polarToCanvas', () => {
  const cx = 100;
  const cy = 100;
  const R = 80;

  it('bearing 0 (N) → punta verso lo zero in alto', () => {
    const { x, y } = polarToCanvas(0, 1, cx, cy, R);
    expect(x).toBeCloseTo(cx, 4);
    expect(y).toBeCloseTo(cy - R, 4);
  });

  it('bearing 90 (E) → destra', () => {
    const { x, y } = polarToCanvas(90, 1, cx, cy, R);
    expect(x).toBeCloseTo(cx + R, 4);
    expect(y).toBeCloseTo(cy, 4);
  });

  it('bearing 180 (S) → sotto', () => {
    const { x, y } = polarToCanvas(180, 1, cx, cy, R);
    expect(x).toBeCloseTo(cx, 4);
    expect(y).toBeCloseTo(cy + R, 4);
  });

  it('bearing 270 (W) → sinistra', () => {
    const { x, y } = polarToCanvas(270, 1, cx, cy, R);
    expect(x).toBeCloseTo(cx - R, 4);
    expect(y).toBeCloseTo(cy, 4);
  });

  it('rangeNorm clampato in [0,1]', () => {
    const { x, y } = polarToCanvas(0, 99, cx, cy, R);
    expect(x).toBeCloseTo(cx, 4);
    expect(y).toBeCloseTo(cy - R, 4);
  });
});

describe('normalizeAngle', () => {
  it('normalizza valori positivi e negativi in [0,360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(720)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe('isSwept', () => {
  it('false se prev === cur (sweep ferma)', () => {
    expect(isSwept(45, 30, 30)).toBe(false);
  });

  it('true se target è nell\'arco prev→cur senza wrap', () => {
    expect(isSwept(45, 30, 60)).toBe(true);
  });

  it('false se target è fuori dall\'arco prev→cur senza wrap', () => {
    expect(isSwept(120, 30, 60)).toBe(false);
  });

  it('gestisce il wrap 359° → 0°', () => {
    expect(isSwept(5, 350, 10)).toBe(true);
    expect(isSwept(180, 350, 10)).toBe(false);
  });

  it('include estremo destro (cur), esclude estremo sinistro (prev)', () => {
    expect(isSwept(60, 30, 60)).toBe(true);
    expect(isSwept(30, 30, 60)).toBe(false);
  });
});

describe('filterInRange', () => {
  it('mantiene solo i punti dentro il raggio', () => {
    const points = [
      { id: 'a', lat: 45, lon: 10 }, // centro
      { id: 'b', lat: 45.4, lon: 10 }, // ~ 44 km
      { id: 'c', lat: 47, lon: 10 }, // ~ 222 km
    ];
    const inRange = filterInRange(points, 45, 10, 100, (p) => ({ lat: p.lat, lon: p.lon }));
    expect(inRange.map((p) => p.id)).toEqual(['a', 'b']);
    expect(inRange[0].polar.inRange).toBe(true);
  });

  it('scarta punti con coordinate non finite', () => {
    const points = [
      { id: 'ok', lat: 45.4, lon: 10 },
      { id: 'nan', lat: NaN, lon: 10 },
      { id: 'inf', lat: 45, lon: Infinity },
    ];
    const inRange = filterInRange(points, 45, 10, 100, (p) => ({ lat: p.lat, lon: p.lon }));
    expect(inRange.map((p) => p.id)).toEqual(['ok']);
  });
});

describe('RADAR_RANGES', () => {
  it('contiene i 4 step richiesti dalla spec', () => {
    expect(RADAR_RANGES.map((r) => r.km)).toEqual([100, 500, 1000, 5000]);
  });

  it('ogni range ha 4 ring (km / ringStepKm = 4)', () => {
    for (const r of RADAR_RANGES) {
      expect(r.km / r.ringStepKm).toBe(4);
    }
  });
});
