import { describe, expect, it } from 'vitest';
import {
  GIBS_BASE_LAYERS,
  GIBS_BY_ID,
  GIBS_LAYERS,
  GIBS_OVERLAY_LAYERS,
  gibsTileUrl,
  gibsTimeFor,
} from './gibsLayers';

const NOW = new Date('2026-05-03T17:34:21Z');

describe('gibsLayers', () => {
  it('exposes 9 layers (4 base + 5 overlay)', () => {
    expect(GIBS_LAYERS).toHaveLength(9);
    expect(GIBS_BASE_LAYERS).toHaveLength(4);
    expect(GIBS_OVERLAY_LAYERS).toHaveLength(5);
  });

  it('every layer is reachable through GIBS_BY_ID', () => {
    for (const layer of GIBS_LAYERS) {
      expect(GIBS_BY_ID[layer.id]).toBe(layer);
    }
  });

  it('uses date - 1 day for daily layers (no isRealTime, no staticDate)', () => {
    const modis = GIBS_BY_ID.gibs_modis_truecolor;
    expect(gibsTimeFor(modis, NOW)).toBe('2026-05-02');
  });

  it('uses staticDate when present (Black Marble)', () => {
    const bm = GIBS_BY_ID.gibs_blackmarble;
    expect(gibsTimeFor(bm, NOW)).toBe('2016-01-01');
  });

  it('does NOT shift -1 day for real-time layers (chiarificazione punto 1)', () => {
    const goes = GIBS_BY_ID.gibs_clouds_geocolor;
    const ts = gibsTimeFor(goes, NOW);
    expect(ts.startsWith('2026-05-03')).toBe(true);
  });

  it('rounds real-time time DOWN to step boundary with safety lag', () => {
    const goes = GIBS_BY_ID.gibs_clouds_geocolor; // step=10min, lag=20min
    // NOW = 17:34:21Z, lag 20min → 17:14:21Z, rounded down to 10min boundary → 17:10:00Z
    expect(gibsTimeFor(goes, NOW)).toBe('2026-05-03T17:10:00Z');
  });

  it('builds a tile url with the computed time substituted', () => {
    const modis = GIBS_BY_ID.gibs_modis_truecolor;
    const url = gibsTileUrl(modis, NOW);
    expect(url).toContain('/2026-05-02/');
    expect(url).not.toContain('{date}');
    expect(url).toMatch(/\{z\}\/\{y\}\/\{x\}\.jpg$/);
  });

  it('builds a real-time url with ISO timestamp substituted', () => {
    const goes = GIBS_BY_ID.gibs_clouds_geocolor;
    const url = gibsTileUrl(goes, NOW);
    expect(url).toContain('/2026-05-03T17:10:00Z/');
  });
});
