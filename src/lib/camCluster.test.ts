import { describe, expect, it } from 'vitest';
import {
  GLOBE_CAM_MIN_ALTITUDE,
  globeCellDegrees,
  globeClusterZoomAltitude,
  globeFocusAltitude,
  isAtGlobeCamFloor,
  globeSingleRadiusDeg,
  gridCluster,
  inBounds,
  nearestPoints,
  padBounds,
  quantizeGlobeAltitude,
  type GeoPoint,
} from './camCluster';

const byDeg = (deg: number) => (p: GeoPoint): [number, number] => [
  Math.floor(p.lat / deg),
  Math.floor(p.lon / deg),
];

describe('gridCluster', () => {
  it('un punto per cella resta singolo, più punti diventano un cluster col baricentro', () => {
    const pts = [
      { lat: 51.51, lon: -0.11, id: 'a' },
      { lat: 51.53, lon: -0.13, id: 'b' },
      { lat: 22.3, lon: 114.2, id: 'c' },
    ];
    const items = gridCluster(pts, byDeg(1), 100);
    const cluster = items.find((i) => i.kind === 'cluster');
    const single = items.find((i) => i.kind === 'single');
    expect(items).toHaveLength(2);
    expect(cluster).toMatchObject({ count: 2 });
    if (cluster?.kind !== 'cluster') throw new Error('atteso cluster');
    expect(cluster.lat).toBeCloseTo(51.52);
    expect(cluster.lon).toBeCloseTo(-0.12);
    expect(cluster.bounds).toEqual({ south: 51.51, north: 51.53, west: -0.13, east: -0.11 });
    expect(single).toMatchObject({ kind: 'single', point: { id: 'c' } });
  });

  it('non supera mai maxItems e privilegia i cluster più numerosi', () => {
    const pts: GeoPoint[] = [];
    for (let i = 0; i < 3000; i++) pts.push({ lat: (i % 60) - 30, lon: Math.floor(i / 60) * 3 - 170 });
    for (let i = 0; i < 50; i++) pts.push({ lat: 45.1, lon: 9.1 });
    const items = gridCluster(pts, byDeg(0.5), 500);
    expect(items).toHaveLength(500);
    expect(items[0]).toMatchObject({ kind: 'cluster', count: 50 });
  });

  it('conserva tutti i punti quando sotto il limite', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ lat: 60 + i * 0.01, lon: 25 }));
    const items = gridCluster(pts, byDeg(0.05), 1000);
    const total = items.reduce((n, i) => n + (i.kind === 'cluster' ? i.count : 1), 0);
    expect(total).toBe(200);
  });
});

describe('inBounds / padBounds', () => {
  const london = { lat: 51.5, lon: -0.1 };
  const hk = { lat: 22.3, lon: 114.2 };

  it('filtra per viewport', () => {
    const europe = { south: 35, north: 70, west: -15, east: 40 };
    expect(inBounds(london, europe)).toBe(true);
    expect(inBounds(hk, europe)).toBe(false);
  });

  it('gestisce vista su tutto il mondo e antimeridiano / mappa srotolata', () => {
    expect(inBounds(hk, { south: -85, north: 85, west: -400, east: 400 })).toBe(true);
    // Vista del Pacifico che attraversa ±180.
    expect(inBounds({ lat: 0, lon: -175 }, { south: -10, north: 10, west: 170, east: 190 })).toBe(true);
    expect(inBounds({ lat: 0, lon: 160 }, { south: -10, north: 10, west: 170, east: 190 })).toBe(false);
    // Copia del mondo spostata di 360° (worldCopyJump).
    expect(inBounds(london, { south: 50, north: 53, west: 358, east: 361 })).toBe(true);
  });

  it('padBounds allarga senza superare i poli', () => {
    expect(padBounds({ south: 80, north: 89, west: 0, east: 10 }, 0.5)).toEqual({
      south: 75.5,
      north: 90,
      west: -5,
      east: 15,
    });
  });
});

describe('globeCellDegrees', () => {
  it('celle più piccole avvicinandosi, sempre nei limiti', () => {
    expect(globeCellDegrees(2.4)).toBeGreaterThan(globeCellDegrees(0.3));
    expect(globeCellDegrees(100)).toBe(16);
    expect(globeCellDegrees(0.0001)).toBe(1 / 64);
    expect(globeCellDegrees(NaN)).toBeGreaterThan(0);
  });
});

describe('globo 3D — progressione dello zoom sui cluster', () => {
  // Estensione reale del cluster di Londra (TfL).
  const london = { south: 51.29, north: 51.69, west: -0.51, east: 0.33 };

  it('il click avvicina e divide il cluster, fermandosi alla quota leggibile', () => {
    const cellFor = (alt: number) => globeCellDegrees(quantizeGlobeAltitude(alt));
    let alt = 2.4;
    const steps: number[] = [];
    let bounds = london;
    for (let i = 0; i < 10 && !isAtGlobeCamFloor(alt); i++) {
      alt = globeClusterZoomAltitude(bounds, alt);
      steps.push(alt);
      const c = cellFor(alt);
      bounds = { south: 51.5, north: 51.5 + c, west: -0.1, east: -0.1 + c };
    }
    // Ogni click avvicina davvero (almeno ×2) e in pochi click si arriva al limite.
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] / 2);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(Math.min(...steps)).toBe(GLOBE_CAM_MIN_ALTITUDE);
    // Il primo click porta già la cella più vicina all'estensione di Londra.
    expect(cellFor(steps[0])).toBeLessThan(cellFor(2.4));
  });

  it('non scende mai sotto la quota leggibile (texture 2K), anche per camere coincidenti', () => {
    const same = { south: 22.3, north: 22.3, west: 114.1, east: 114.1 };
    expect(globeClusterZoomAltitude(same, 0.05)).toBe(GLOBE_CAM_MIN_ALTITUDE);
    expect(globeClusterZoomAltitude(same, NaN)).toBe(GLOBE_CAM_MIN_ALTITUDE);
    expect(isAtGlobeCamFloor(GLOBE_CAM_MIN_ALTITUDE)).toBe(true);
    expect(isAtGlobeCamFloor(1)).toBe(false);
  });

  it('centratura da Explorer: contesto regionale, mai troppo vicino né troppo lontano', () => {
    expect(globeFocusAltitude(2.4)).toBe(0.5);
    expect(globeFocusAltitude(0.4)).toBe(0.4);
    expect(globeFocusAltitude(0.01)).toBe(GLOBE_CAM_MIN_ALTITUDE);
  });

  it('il raggio dei punti singoli segue la quota (dimensione a schermo ~costante) ed è limitato', () => {
    expect(globeSingleRadiusDeg(0.05)).toBeLessThan(globeSingleRadiusDeg(0.5));
    expect(globeSingleRadiusDeg(0.05) / 0.05).toBeCloseTo(globeSingleRadiusDeg(0.5) / 0.5);
    expect(globeSingleRadiusDeg(100)).toBe(0.3);
    expect(globeSingleRadiusDeg(0)).toBe(0.002);
  });

  it('quantizeGlobeAltitude a passi di √2 (pochi ricalcoli durante lo zoom)', () => {
    expect(quantizeGlobeAltitude(2.1)).toBeCloseTo(2);
    expect(quantizeGlobeAltitude(2.9)).toBeCloseTo(Math.SQRT2 * 2);
    expect(quantizeGlobeAltitude(-1)).toBeGreaterThan(0);
  });

  it('nearestPoints: i più vicini al centro, con limite e wrap ±180', () => {
    const pts = [
      { lat: 51.5, lon: -0.1, id: 'a' },
      { lat: 51.6, lon: -0.2, id: 'b' },
      { lat: 22.3, lon: 114.2, id: 'c' },
      { lat: 0, lon: 179.9, id: 'd' },
    ];
    expect(nearestPoints(pts, 51.5, -0.1, 2).map((p) => p.id)).toEqual(['a', 'b']);
    expect(nearestPoints(pts, 0, -179.9, 1).map((p) => p.id)).toEqual(['d']);
    expect(nearestPoints(pts, 0, 0, 10)).toHaveLength(4);
  });
});
