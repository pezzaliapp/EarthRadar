import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from './index';

/**
 * Regression guard: il bug delle chiavi `radar.*` (Fase 2.7) era nato perché
 * il file JSON aveva DUE namespace `"radar"` distinti (radar precipitazioni
 * + Radar Mode tributo). JSON.parse risolve last-wins → tutte le chiavi del
 * primo block venivano sovrascritte e il `RainRadarControls` mostrava le
 * chiavi grezze.
 *
 * Questo test apre il file *raw* (no JSON.parse) e verifica che a top-level
 * non ci siano chiavi duplicate.
 */

function topLevelKeysOf(jsonText: string): string[] {
  // Scanner stupido ma sufficiente: troviamo le righe `  "key": ...`
  // a indentazione di 2 spazi (quelle top-level del nostro JSON pretty-printed).
  const out: string[] = [];
  for (const line of jsonText.split(/\r?\n/)) {
    const m = line.match(/^ {2}"([^"]+)":/);
    if (m) out.push(m[1]);
  }
  return out;
}

describe('i18n raw JSON files', () => {
  for (const file of ['it.json', 'en.json']) {
    it(`${file} has no duplicate top-level namespaces`, () => {
      const path = join(__dirname, file);
      const text = readFileSync(path, 'utf-8');
      const keys = topLevelKeysOf(text);
      const seen = new Set<string>();
      const dups: string[] = [];
      for (const k of keys) {
        if (seen.has(k)) dups.push(k);
        seen.add(k);
      }
      expect(dups, `duplicate top-level keys in ${file}: ${dups.join(', ')}`).toEqual([]);
    });
  }
});

describe('translate(): radar precipitation namespace', () => {
  // Chiavi usate da RainRadarControls.tsx + LayerPanel "Radar precipitazioni".
  const REQUIRED = [
    'radar.title',
    'radar.subtitle',
    'radar.play',
    'radar.pause',
    'radar.frame',
    'radar.opacity',
    'radar.attribution',
    'radar.noFrames',
    'radar.loading',
  ];

  for (const lang of ['it', 'en'] as const) {
    for (const key of REQUIRED) {
      it(`${lang}: ${key} resolves to a non-key string`, () => {
        const v = translate(lang, key);
        expect(v).not.toBe(key);
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      });
    }
  }

  it('IT radar.attribution mentions RainViewer (regression: was being shadowed by Radar Mode block)', () => {
    expect(translate('it', 'radar.attribution')).toMatch(/RainViewer/i);
  });

  it('EN radar.attribution mentions RainViewer', () => {
    expect(translate('en', 'radar.attribution')).toMatch(/RainViewer/i);
  });

  it('IT radar.title is the precipitation radar, not the tribute Radar Mode', () => {
    expect(translate('it', 'radar.title')).toMatch(/precipitazioni/i);
  });

  it('EN radar.title is the precipitation radar', () => {
    expect(translate('en', 'radar.title')).toMatch(/precipitation/i);
  });
});

describe('translate(): radarMode tribute namespace', () => {
  // Chiavi usate dalla pagina Radar Mode (v1.0.1): title, intro, controls UI,
  // legenda e disclaimer divulgativo. Il placeholder originale è stato
  // sostituito dalla feature reale e non esiste più.
  const REQUIRED = [
    'radarMode.title',
    'radarMode.subtitle',
    'radarMode.intro',
    'radarMode.rangeLabel',
    'radarMode.audioToggle',
    'radarMode.disclaimer',
    'radarMode.tributeBadge',
  ];

  for (const lang of ['it', 'en'] as const) {
    it(`${lang}: radarMode.title is "Radar Mode"`, () => {
      expect(translate(lang, 'radarMode.title')).toBe('Radar Mode');
    });
    for (const key of REQUIRED) {
      it(`${lang}: ${key} resolves to a non-key string`, () => {
        const v = translate(lang, key);
        expect(v).not.toBe(key);
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('translate(): home Globe3D keys (Fase 3)', () => {
  // Chiavi nuove per la vista 3D: loader globo, banner overlay-only-2D,
  // info auto-fallback 2D per perf bassa.
  const REQUIRED = [
    'home.globeLoading',
    'home.overlayOnly2D',
    'home.perfFallbackInfo',
  ];

  for (const lang of ['it', 'en'] as const) {
    for (const key of REQUIRED) {
      it(`${lang}: ${key} resolves to a non-key string`, () => {
        const v = translate(lang, key);
        expect(v).not.toBe(key);
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      });
    }
  }

  it('IT overlay-only-2D mentions GIBS / Lightning / Radar', () => {
    expect(translate('it', 'home.overlayOnly2D')).toMatch(/GIBS/);
    expect(translate('it', 'home.overlayOnly2D')).toMatch(/Radar/i);
  });

  it('EN perfFallbackInfo mentions 2D fallback', () => {
    expect(translate('en', 'home.perfFallbackInfo')).toMatch(/2D/);
  });
});

describe('translate(): lightning namespace (Fase 2.8)', () => {
  // Chiavi usate da LightningRow + LightningDetailPanel.
  const REQUIRED = [
    'lightning.title',
    'lightning.subtitle',
    'lightning.mvpBanner',
    'lightning.detailTitle',
    'lightning.detailIntro',
    'lightning.detailBullet1',
    'lightning.detailBullet2',
    'lightning.detailBullet3',
    'lightning.attribution',
  ];

  for (const lang of ['it', 'en'] as const) {
    for (const key of REQUIRED) {
      it(`${lang}: ${key} resolves to a non-key string`, () => {
        const v = translate(lang, key);
        expect(v).not.toBe(key);
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      });
    }
  }

  it('IT mvpBanner mentions Blitzortung (v1.1 promise)', () => {
    expect(translate('it', 'lightning.mvpBanner')).toMatch(/Blitzortung/i);
  });

  it('EN mvpBanner mentions Blitzortung', () => {
    expect(translate('en', 'lightning.mvpBanner')).toMatch(/Blitzortung/i);
  });

  it('attribution mentions LIS and TRMM in both languages', () => {
    for (const lang of ['it', 'en'] as const) {
      const v = translate(lang, 'lightning.attribution');
      expect(v).toMatch(/LIS/);
      expect(v).toMatch(/TRMM/);
    }
  });
});
