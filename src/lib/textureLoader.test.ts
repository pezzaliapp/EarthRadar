import { describe, expect, it } from 'vitest';
import { buildProfile, resolveTextureSet } from './textureLoader';

describe('buildProfile', () => {
  it('marks narrow viewport as low-end', () => {
    const p = buildProfile({ isNarrow: true, deviceMemoryGb: 8 });
    expect(p.isLowEnd).toBe(true);
  });

  it('marks low-memory device as low-end even if not narrow', () => {
    const p = buildProfile({ isNarrow: false, deviceMemoryGb: 2 });
    expect(p.isLowEnd).toBe(true);
  });

  it('treats unknown deviceMemory (Safari) as not-low-end if viewport is wide', () => {
    const p = buildProfile({ isNarrow: false, deviceMemoryGb: null });
    expect(p.isLowEnd).toBe(false);
  });

  it('full desktop with high mem is not low-end', () => {
    const p = buildProfile({ isNarrow: false, deviceMemoryGb: 16 });
    expect(p.isLowEnd).toBe(false);
  });
});

describe('resolveTextureSet', () => {
  it('returns 2K + no bump for low-end profile', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: true, deviceMemoryGb: 4 }));
    expect(set.isLite).toBe(true);
    expect(set.blueMarble).toContain('5400x2700');
    expect(set.blackMarble).toContain('3km');
    expect(set.bumpMap).toBeNull();
  });

  it('returns 8K + bump for high-end desktop', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 }));
    expect(set.isLite).toBe(false);
    expect(set.blueMarble).toContain('21600x10800');
    expect(set.blackMarble).toContain('01deg');
    expect(set.bumpMap).not.toBeNull();
  });

  it('every texture URL targets the NASA Visible Earth CDN', () => {
    const sets = [
      resolveTextureSet(buildProfile({ isNarrow: true, deviceMemoryGb: 2 })),
      resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 })),
    ];
    for (const s of sets) {
      expect(s.blueMarble.startsWith('https://eoimages.gsfc.nasa.gov/')).toBe(true);
      expect(s.blackMarble.startsWith('https://eoimages.gsfc.nasa.gov/')).toBe(true);
      if (s.bumpMap) expect(s.bumpMap.startsWith('https://eoimages.gsfc.nasa.gov/')).toBe(true);
    }
  });

  it('Blue Marble + Black Marble are different URLs (not accidentally same)', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 }));
    expect(set.blueMarble).not.toBe(set.blackMarble);
  });
});
