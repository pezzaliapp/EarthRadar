import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

describe('resolveTextureSet — local hosting (CORS-free)', () => {
  it('low-end profile: textures puntano a path locali con isLite=true', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: true, deviceMemoryGb: 4 }));
    expect(set.isLite).toBe(true);
    expect(set.blueMarble).toContain('/textures/earth-blue-marble-2k.jpg');
    expect(set.blackMarble).toContain('/textures/earth-black-marble-2k.jpg');
  });

  it('high-end desktop: stesse texture (MVP solo 2K), isLite=false', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 }));
    expect(set.isLite).toBe(false);
    expect(set.blueMarble).toContain('/textures/earth-blue-marble-2k.jpg');
    expect(set.blackMarble).toContain('/textures/earth-black-marble-2k.jpg');
  });

  it('bumpMap is null in MVP local-hosting (no asset committed)', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 }));
    expect(set.bumpMap).toBeNull();
  });

  it('Blue Marble + Black Marble sono due path distinti', () => {
    const set = resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 }));
    expect(set.blueMarble).not.toBe(set.blackMarble);
  });

  it('CORS regression guard — niente CDN remoti in nessun URL', () => {
    // Difesa contro il bug della Fase 3: il CDN NASA Visible Earth NON
    // espone Access-Control-Allow-Origin → THREE.TextureLoader fallisce
    // → globo nero. Le texture DEVONO essere same-origin (asset locali).
    const sets = [
      resolveTextureSet(buildProfile({ isNarrow: true, deviceMemoryGb: 2 })),
      resolveTextureSet(buildProfile({ isNarrow: false, deviceMemoryGb: 16 })),
    ];
    for (const s of sets) {
      const urls = [s.blueMarble, s.blackMarble, s.bumpMap].filter(
        (u): u is string => !!u,
      );
      for (const u of urls) {
        // Path-relative o con basename app, MAI assoluto verso CDN esterno.
        expect(u.startsWith('/'), `${u} must be a local path`).toBe(true);
        expect(u).not.toMatch(/^https?:\/\//);
        expect(u).not.toContain('eoimages.gsfc.nasa.gov');
        expect(u).not.toContain('visibleearth.nasa.gov');
      }
    }
  });
});

describe('texture assets — file su disco', () => {
  // Una build pulita richiede che gli asset esistano in `public/textures/`.
  // Vite copia automaticamente `public/` in `dist/` al build → niente di più
  // da fare in vite.config.ts.
  const PUBLIC_DIR = join(__dirname, '..', '..', 'public', 'textures');

  it('earth-blue-marble-2k.jpg exists in public/textures/', () => {
    expect(existsSync(join(PUBLIC_DIR, 'earth-blue-marble-2k.jpg'))).toBe(true);
  });

  it('earth-black-marble-2k.jpg exists in public/textures/', () => {
    expect(existsSync(join(PUBLIC_DIR, 'earth-black-marble-2k.jpg'))).toBe(true);
  });
});
