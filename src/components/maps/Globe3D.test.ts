import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Difesa contro il bug di hotfix `fix/frame-ticker-compat`:
 *
 *   The requested module '/EarthRadar/node_modules/frame-ticker/dist/
 *   FrameTicker.js' does not provide an export named 'default'
 *
 * Cause root
 * - `frame-ticker@1.0.3` è un bundle UMD legacy (`module.exports=...`),
 *   `package.json` ha `main` ma NON `module`/`exports`/`type:module`.
 *   È l'unica delle 8 dep di three-globe a non essere ESM nativa.
 * - I suoi consumer (react-globe.gl / globe.gl / three-globe) sono in
 *   `optimizeDeps.exclude` (hotfix #6 per il dedupe React).
 * - Vite quindi non pre-bundla nemmeno le sub-dep dei consumer excluded
 *   → frame-ticker viene caricato raw come ESM nativo → l'import
 *   `import _FT from 'frame-ticker'` dentro three-globe.mjs fallisce.
 *
 * Fix: includere `frame-ticker` in `optimizeDeps.include` per forzarne il
 * pre-bundle in dev. Vite lo trasforma in ESM con default export interop.
 *
 * Strategia di difesa
 * 1. Smoke test: `import('./Globe3D')` deve risolvere. In vitest la pipeline
 *    è leggermente diversa dal dev server, ma è comunque utile per
 *    intercettare future rotture dell'import chain.
 * 2. Sentinella su `vite.config.ts`: se qualcuno rimuove `frame-ticker` da
 *    `optimizeDeps.include`, questo test fallisce con un messaggio chiaro
 *    che linka all'incidente di hotfix.
 */
describe('Globe3D module', () => {
  it('imports cleanly with a default export', async () => {
    const mod = await import('./Globe3D');
    expect(mod).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('vite.config.ts pre-bundle sentinel', () => {
  it('keeps frame-ticker inside optimizeDeps.include (regression: UMD interop)', () => {
    const config = readFileSync(
      join(__dirname, '..', '..', '..', 'vite.config.ts'),
      'utf-8',
    );
    // Cerchiamo la entry nel blocco optimizeDeps.include. Il match è generoso
    // (può essere dentro o fuori da virgolette doppie): se il file viene
    // riformattato, basta che la stringa esista.
    expect(
      config.includes("'frame-ticker'") || config.includes('"frame-ticker"'),
      "frame-ticker MUST be listed in optimizeDeps.include — see hotfix fix/frame-ticker-compat",
    ).toBe(true);
  });
});
