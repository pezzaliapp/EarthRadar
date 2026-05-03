import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampFirmsBbox,
  firmsAreaParam,
  firmsMapKey,
  frpColor,
  frpSeverity,
  getHotspots,
  parseFirmsCsv,
} from './firmsApi';

describe('parseFirmsCsv', () => {
  it('parses a valid VIIRS NRT sample with header + 5 rows', () => {
    const csv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '37.123,-120.456,330.5,0.4,0.4,2024-09-25,1830,N,VIIRS,n,2.0NRT,295.6,12.3,D',
      '38.001,-119.211,355.1,0.4,0.4,2024-09-25,1830,N,VIIRS,h,2.0NRT,300.2,180.0,D',
      '36.500,-122.000,290.0,0.4,0.4,2024-09-25,0125,N,VIIRS,l,2.0NRT,275.0,5.0,N',
      '40.000,-118.000,360.0,0.5,0.5,2024-09-25,1830,N,VIIRS,n,2.0NRT,310.0,250.5,D',
      '35.500,-119.000,340.0,0.4,0.4,2024-09-24,1235,N,VIIRS,n,2.0NRT,300.0,42.7,D',
    ].join('\n');
    const hs = parseFirmsCsv(csv);
    expect(hs).toHaveLength(5);
    expect(hs[0].lat).toBeCloseTo(37.123);
    expect(hs[0].lon).toBeCloseTo(-120.456);
    expect(hs[0].frp).toBe(12.3);
    expect(hs[0].dayNight).toBe('D');
    expect(hs[0].confidence).toBe('n');
    expect(hs[0].instrument).toBe('VIIRS');
    expect(hs[3].frp).toBe(250.5);
  });

  it('parses MODIS NRT sample with brightness/bright_t31 columns', () => {
    const csv = [
      'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight',
      '-2.45,113.50,330.5,1.0,1.0,2024-09-25,0530,T,MODIS,75,6.1NRT,295.5,55.2,D',
    ].join('\n');
    const hs = parseFirmsCsv(csv);
    expect(hs).toHaveLength(1);
    expect(hs[0].brightness).toBeCloseTo(330.5);
    expect(hs[0].brightT31).toBeCloseTo(295.5);
    expect(hs[0].confidence).toBe('75');
    expect(hs[0].satellite).toBe('T');
  });

  it('drops malformed rows with non-numeric lat/lon', () => {
    const csv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      'not-a-number,-120,330,0.4,0.4,2024-09-25,1830,N,VIIRS,n,2.0NRT,295,12,D',
      '37,foo,330,0.4,0.4,2024-09-25,1830,N,VIIRS,n,2.0NRT,295,12,D',
      '37.5,-120.0,330.5,0.4,0.4,2024-09-25,1830,N,VIIRS,n,2.0NRT,295.0,12.0,D',
    ].join('\n');
    const hs = parseFirmsCsv(csv);
    expect(hs).toHaveLength(1);
    expect(hs[0].lat).toBe(37.5);
  });

  it('returns [] on empty/malformed input', () => {
    expect(parseFirmsCsv('')).toEqual([]);
    expect(parseFirmsCsv('only header lat,lon')).toEqual([]);
    expect(parseFirmsCsv('foo,bar,baz\n1,2,3')).toEqual([]);
  });

  it('returns [] when latitude/longitude columns are missing from header', () => {
    const csv = [
      'fire_id,acq_date,frp',
      'A1,2024-09-25,55',
      'A2,2024-09-25,80',
    ].join('\n');
    expect(parseFirmsCsv(csv)).toEqual([]);
  });

  it('coerces missing optional numeric fields to 0', () => {
    const csv = [
      'latitude,longitude,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,frp,daynight',
      '37.5,-120.0,0.4,0.4,2024-09-25,1830,N,VIIRS,n,2.0NRT,12,D',
    ].join('\n');
    const hs = parseFirmsCsv(csv);
    expect(hs).toHaveLength(1);
    expect(hs[0].brightness).toBe(0);
    expect(hs[0].brightT31).toBe(0);
  });
});

describe('clampFirmsBbox', () => {
  it('caps a worldwide bbox to a 10°×10° area centered on the midpoint', () => {
    const [w, s, e, n] = clampFirmsBbox([-180, -85, 180, 85]);
    expect(e - w).toBeCloseTo(10, 5);
    expect(n - s).toBeCloseTo(10, 5);
    // Centered on (0, 0) for this symmetric input.
    expect((w + e) / 2).toBeCloseTo(0);
    expect((s + n) / 2).toBeCloseTo(0);
  });

  it('keeps a small bbox unchanged', () => {
    const bbox = [9, 44, 11, 45] as [number, number, number, number];
    expect(clampFirmsBbox(bbox)).toEqual([9, 44, 11, 45]);
  });

  it('clamps lat/lon to physical limits', () => {
    const [w, s, e, n] = clampFirmsBbox([-200, -100, 200, 100]);
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(e).toBeLessThanOrEqual(180);
    expect(s).toBeGreaterThanOrEqual(-90);
    expect(n).toBeLessThanOrEqual(90);
  });

  it('respects a custom maxSpan', () => {
    const [w, s, e, n] = clampFirmsBbox([-50, -40, 50, 40], 4);
    expect(e - w).toBeCloseTo(4, 5);
    expect(n - s).toBeCloseTo(4, 5);
  });

  it('swaps inverted ordering (south > north) into canonical form', () => {
    const [w, s, e, n] = clampFirmsBbox([10, 50, 12, 48]);
    expect(s).toBeLessThanOrEqual(n);
    expect(w).toBeLessThanOrEqual(e);
  });
});

describe('firmsAreaParam', () => {
  it('emits west,south,east,north with 3 decimal places', () => {
    const param = firmsAreaParam([9.123456, 44.5, 11.2, 45.0]);
    expect(param).toBe('9.123,44.500,11.200,45.000');
  });
});

describe('firmsMapKey + getHotspots fallback', () => {
  const originalEnv = import.meta.env.VITE_FIRMS_MAP_KEY;

  afterEach(() => {
    // Ripristina l'env per non sporcare altri test.
    (import.meta.env as Record<string, unknown>).VITE_FIRMS_MAP_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns null when VITE_FIRMS_MAP_KEY is missing', () => {
    (import.meta.env as Record<string, unknown>).VITE_FIRMS_MAP_KEY = '';
    expect(firmsMapKey()).toBeNull();
    (import.meta.env as Record<string, unknown>).VITE_FIRMS_MAP_KEY = '   ';
    expect(firmsMapKey()).toBeNull();
  });

  it('returns the trimmed key when configured', () => {
    (import.meta.env as Record<string, unknown>).VITE_FIRMS_MAP_KEY = '  abc123  ';
    expect(firmsMapKey()).toBe('abc123');
  });

  it('getHotspots returns missingKey:true and never calls fetch when key is absent', async () => {
    (import.meta.env as Record<string, unknown>).VITE_FIRMS_MAP_KEY = '';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await getHotspots({ bbox: [9, 44, 11, 45] });
    expect(r.missingKey).toBe(true);
    expect(r.value).toEqual([]);
    expect(r.source).toBe('fallback');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('frpColor + frpSeverity', () => {
  it('maps 3 FRP brackets to known colors', () => {
    expect(frpColor(0)).toBe('#fbbf24');
    expect(frpColor(49.9)).toBe('#fbbf24');
    expect(frpColor(50)).toBe('#fb923c');
    expect(frpColor(150)).toBe('#fb923c');
    expect(frpColor(200)).toBe('#fb923c');
    expect(frpColor(200.1)).toBe('#ef4444');
    expect(frpColor(500)).toBe('#ef4444');
  });

  it('falls back to yellow for non-finite FRP (NaN, ±Infinity)', () => {
    expect(frpColor(Number.NaN)).toBe('#fbbf24');
    expect(frpColor(Number.POSITIVE_INFINITY)).toBe('#fbbf24');
    expect(frpColor(Number.NEGATIVE_INFINITY)).toBe('#fbbf24');
  });

  it('frpSeverity matches the same brackets', () => {
    expect(frpSeverity(10)).toBe('low');
    expect(frpSeverity(150)).toBe('mid');
    expect(frpSeverity(500)).toBe('high');
  });
});
