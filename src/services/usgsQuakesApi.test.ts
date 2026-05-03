import { describe, expect, it } from 'vitest';
import { parseUsgsFeatureCollection } from './usgsQuakesApi';

const VALID_FEATURE = {
  type: 'Feature',
  id: 'test-1',
  properties: {
    mag: 5.6,
    place: 'Andreanof Islands',
    time: 1744998000000,
    updated: 1744998000000,
    url: 'https://example.test/1',
    tsunami: 0,
    sig: 482,
    title: 'M 5.6 — Andreanof Islands',
    alert: null,
  },
  geometry: { type: 'Point', coordinates: [-176.43, 51.62, 38.4] },
};

describe('parseUsgsFeatureCollection', () => {
  it('returns [] on null/undefined/wrong shape', () => {
    expect(parseUsgsFeatureCollection(null)).toEqual([]);
    expect(parseUsgsFeatureCollection(undefined)).toEqual([]);
    expect(parseUsgsFeatureCollection({})).toEqual([]);
    expect(parseUsgsFeatureCollection({ features: 'nope' })).toEqual([]);
  });

  it('parses a valid feature into the normalized Quake shape', () => {
    const out = parseUsgsFeatureCollection({ type: 'FeatureCollection', features: [VALID_FEATURE] });
    expect(out).toHaveLength(1);
    const q = out[0];
    expect(q.id).toBe('test-1');
    expect(q.magnitude).toBe(5.6);
    expect(q.lat).toBeCloseTo(51.62, 5);
    expect(q.lon).toBeCloseTo(-176.43, 5);
    expect(q.depthKm).toBeCloseTo(38.4, 5);
    expect(q.tsunami).toBe(false);
    expect(q.title).toBe('M 5.6 — Andreanof Islands');
    expect(q.url).toBe('https://example.test/1');
  });

  it('drops features with NaN/null magnitude or invalid coords', () => {
    const bad = [
      { ...VALID_FEATURE, id: 'b1', properties: { ...VALID_FEATURE.properties, mag: null } },
      { ...VALID_FEATURE, id: 'b2', geometry: { type: 'Point', coordinates: ['x', 'y'] } },
      { ...VALID_FEATURE, id: 'b3', properties: { ...VALID_FEATURE.properties, time: 0 } },
      { id: 'b4' },
    ];
    const out = parseUsgsFeatureCollection({ features: bad });
    expect(out).toEqual([]);
  });

  it('keeps the valid ones when mixed with bad ones', () => {
    const out = parseUsgsFeatureCollection({
      features: [{ id: 'b1', properties: {} }, VALID_FEATURE],
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('test-1');
  });

  it('sorts results by time descending (most recent first)', () => {
    const older = {
      ...VALID_FEATURE,
      id: 'older',
      properties: { ...VALID_FEATURE.properties, time: 1700000000000 },
    };
    const newer = {
      ...VALID_FEATURE,
      id: 'newer',
      properties: { ...VALID_FEATURE.properties, time: 1800000000000 },
    };
    const out = parseUsgsFeatureCollection({ features: [older, newer] });
    expect(out.map((q) => q.id)).toEqual(['newer', 'older']);
  });

  it('treats tsunami flag as boolean', () => {
    const tsu = {
      ...VALID_FEATURE,
      id: 'tsu',
      properties: { ...VALID_FEATURE.properties, tsunami: 1 },
    };
    const out = parseUsgsFeatureCollection({ features: [tsu] });
    expect(out[0].tsunami).toBe(true);
  });

  it('synthesizes a title when missing', () => {
    const noTitle = {
      ...VALID_FEATURE,
      id: 'nt',
      properties: { ...VALID_FEATURE.properties, title: null, place: 'nowhere', mag: 3.21 },
    };
    const out = parseUsgsFeatureCollection({ features: [noTitle] });
    expect(out[0].title).toBe('M 3.2 — nowhere');
  });
});
