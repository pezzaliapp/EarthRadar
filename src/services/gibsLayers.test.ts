import { describe, expect, it } from 'vitest';
import {
  GIBS_BASE_LAYERS,
  GIBS_BY_ID,
  GIBS_LAYERS,
  GIBS_OVERLAY_LAYERS,
  GIBS_OVERLAY_WARN_THRESHOLD,
  activeGibsOverlays,
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

  it('every overlay layer produces a well-formed tile URL with epsg3857 + tile coords', () => {
    for (const layer of GIBS_OVERLAY_LAYERS) {
      const url = gibsTileUrl(layer, NOW);
      expect(url).not.toContain('{date}');
      expect(url.startsWith('https://gibs.earthdata.nasa.gov/wmts/epsg3857/')).toBe(true);
      expect(url).toMatch(/\{z\}\/\{y\}\/\{x\}\.(?:jpg|png)$/);
    }
  });

  it('exposes the 5 expected overlay ids from the architecture plan', () => {
    const expected = [
      'gibs_temperature',
      'gibs_aerosol',
      'gibs_fires',
      'gibs_snow',
      'gibs_seaice',
    ];
    const actual = GIBS_OVERLAY_LAYERS.map((l) => l.id).sort();
    expect(actual).toEqual(expected.slice().sort());
  });

  it.each([
    ['gibs_temperature', 'AIRS_L2_Surface_Air_Temperature_Day'],
    ['gibs_aerosol', 'MODIS_Combined_Value-Added_AOD'],
    ['gibs_fires', 'MODIS_Fires_All'],
    ['gibs_snow', 'MODIS_Terra_Snow_Cover'],
    ['gibs_seaice', 'AMSR2_Sea_Ice_Concentration_12km'],
  ])('overlay %s targets the WMTS layer %s', (id, wmtsName) => {
    const layer = GIBS_BY_ID[id];
    expect(layer.url).toContain(`/${wmtsName}/`);
  });

  it('all GIBS overlay layers are daily (no isRealTime)', () => {
    for (const layer of GIBS_OVERLAY_LAYERS) {
      expect(layer.isRealTime ?? false).toBe(false);
      // Daily layers are shifted -1 day (NASA publishes with ~24h delay).
      expect(gibsTimeFor(layer, NOW)).toBe('2026-05-02');
    }
  });
});

describe('activeGibsOverlays + warn threshold', () => {
  it('warn threshold is 3 (mobile-4G heuristic)', () => {
    expect(GIBS_OVERLAY_WARN_THRESHOLD).toBe(3);
  });

  it('returns [] when no overlay is enabled', () => {
    expect(activeGibsOverlays({})).toEqual([]);
    expect(
      activeGibsOverlays({
        gibs_temperature: { enabled: false },
        gibs_aerosol: { enabled: false },
      }),
    ).toEqual([]);
  });

  it('returns only overlays whose enabled === true', () => {
    const out = activeGibsOverlays({
      gibs_temperature: { enabled: true },
      gibs_aerosol: { enabled: false },
      gibs_fires: { enabled: true },
      gibs_snow: { enabled: false },
      gibs_seaice: { enabled: true },
    });
    expect(out.map((a) => a.id).sort()).toEqual(
      ['gibs_fires', 'gibs_seaice', 'gibs_temperature'].sort(),
    );
  });

  it('ignores keys that are not in GIBS_OVERLAY_LAYERS (es. quakes, terminator)', () => {
    const out = activeGibsOverlays({
      gibs_temperature: { enabled: true },
      quakes: { enabled: true },
      terminator: { enabled: true },
      satellites: { enabled: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('gibs_temperature');
  });

  it('emits canonical short labels for the attribution chip', () => {
    const out = activeGibsOverlays({
      gibs_temperature: { enabled: true },
      gibs_aerosol: { enabled: true },
      gibs_seaice: { enabled: true },
    });
    const labels = out.map((a) => a.shortLabel).sort();
    expect(labels).toEqual(['AIRS', 'AMSR2 Sea Ice', 'MODIS AOD']);
  });
});
