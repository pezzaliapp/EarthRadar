import { describe, expect, it } from 'vitest';
import { EONET_CATEGORIES, eonetCategorySpec } from './eonetCategories';

describe('eonetCategorySpec', () => {
  it('exposes 13 well-known categories', () => {
    expect(EONET_CATEGORIES.length).toBeGreaterThanOrEqual(13);
    const ids = EONET_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('volcanoes');
    expect(ids).toContain('wildfires');
    expect(ids).toContain('severeStorms');
    expect(ids).toContain('seaLakeIce');
  });

  it('maps known ids to emoji + i18nKey', () => {
    expect(eonetCategorySpec('volcanoes').emoji).toBe('🌋');
    expect(eonetCategorySpec('wildfires').i18nKey).toBe('eonet.cat.wildfires');
    expect(eonetCategorySpec('severeStorms').severity).toBe('severe');
  });

  it('returns unknown for null / unknown ids', () => {
    expect(eonetCategorySpec(null).i18nKey).toBe('eonet.cat.unknown');
    expect(eonetCategorySpec('').i18nKey).toBe('eonet.cat.unknown');
    expect(eonetCategorySpec('foo').i18nKey).toBe('eonet.cat.unknown');
  });
});
