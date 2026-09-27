import { describe, expect, it } from 'vitest';
import { haversineKm } from '@/utils/geo';
import { coverageRing, isWideGlobeView, isWideMapView } from './aircraftCoverage';

describe('area interrogata dagli aerei', () => {
  it('anello chiuso a 150 NM (277,8 km) dal centro della richiesta', () => {
    const ring = coverageRing(44.5, 10.5, 150);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lat, lon] of ring) expect(haversineKm(44.5, 10.5, lat, lon)).toBeCloseTo(277.8, 0);
  });

  it('vista ampia: globo lontano o mappa a zoom basso', () => {
    expect(isWideGlobeView(2.4)).toBe(true);
    expect(isWideGlobeView(0.1)).toBe(false);
    expect(isWideMapView(3)).toBe(true);
    expect(isWideMapView(8)).toBe(false);
  });
});
