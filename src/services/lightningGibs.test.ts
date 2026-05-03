import { describe, expect, it } from 'vitest';
import {
  LIGHTNING_ATTRIBUTION,
  LIGHTNING_LIS_LAYER_ID,
  LIGHTNING_MAX_NATIVE_ZOOM,
  lightningTileUrl,
} from './lightningGibs';

describe('lightningGibs', () => {
  it('uses the LIS Full Climatology Mean Flash Rate identifier', () => {
    // Verifica esatta dell'id catalogato nel WMTS GetCapabilities.
    // Sentinella: se NASA dovesse rinominare/decommissionare il layer,
    // questo test salta e ci ricorda di scegliere un sostituto.
    expect(LIGHTNING_LIS_LAYER_ID).toBe(
      'LIS_Very_High_Resolution_Lightning_Full_Climatology_LIS_Mean_Flash_Rate',
    );
  });

  it('builds a Leaflet-compatible tile URL with {z}/{y}/{x} placeholders', () => {
    const url = lightningTileUrl();
    expect(url).toMatch(/\{z\}\/\{y\}\/\{x\}\.png$/);
  });

  it('targets the GIBS WMTS REST endpoint over HTTPS', () => {
    const url = lightningTileUrl();
    expect(url.startsWith('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/')).toBe(true);
  });

  it("uses 'default' as the time slug (static climatology, no date param)", () => {
    // Probato a 2026-05-03 contro il GetCapabilities: per LIS Full il param
    // `default` è quello che restituisce HTTP 200, mentre date specifiche
    // tipo 2024-01-01 davano 404. Il layer è una climatologia statica.
    const url = lightningTileUrl();
    expect(url).toContain('/default/default/');
  });

  it('uses GoogleMapsCompatible_Level6 (max native 6 from GIBS catalog)', () => {
    const url = lightningTileUrl();
    expect(url).toContain('/GoogleMapsCompatible_Level6/');
    expect(LIGHTNING_MAX_NATIVE_ZOOM).toBe(6);
  });

  it('attribution mentions GIBS and LIS/TRMM', () => {
    expect(LIGHTNING_ATTRIBUTION).toMatch(/GIBS/);
    expect(LIGHTNING_ATTRIBUTION).toMatch(/LIS/);
    expect(LIGHTNING_ATTRIBUTION).toMatch(/TRMM/);
  });
});
