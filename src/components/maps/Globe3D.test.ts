import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Difesa strutturale contro il pattern di rottura CJS/UMD legacy nella
 * catena di dep 3D di react-globe.gl. Documentato nell'hotfix
 * `fix/frame-ticker-compat` (PR #13).
 *
 * Errore tipico osservato in dev:
 *
 *   The requested module '/EarthRadar/node_modules/<pkg>/...' does
 *   not provide an export named 'default'
 *
 * Cause root del pattern
 * - I consumer ESM react-globe.gl / globe.gl / three-globe / frame-ticker
 *   sono in `optimizeDeps.exclude` (hotfix #6 per il dedupe React +
 *   isolamento del bundle 3D pesante).
 * - Vite NON pre-bundla nemmeno le sub-dep dei consumer excluded.
 * - Quando una sub-dep è UMD legacy (solo `main`, niente `module`/
 *   `exports`/`type:"module"` nel package.json) viene servita raw come
 *   ESM nativo e gli `import default` falliscono.
 *
 * Soluzione
 * - Pre-bundle forzato di TUTTI i CJS legacy della catena via
 *   `optimizeDeps.include`. Lista derivata da uno scan ad-hoc dei
 *   package.json transitivi.
 *
 * Strategia di difesa di questo file
 * 1. Smoke test: `import('./Globe3D')` deve risolvere. La pipeline vitest
 *    è leggermente diversa dal dev server (transformer JS-DOM vs Vite
 *    middleware) ma intercetta comunque rotture grossolane dell'import
 *    chain.
 * 2. Sentinella su `vite.config.ts`: ognuno dei moduli noti DEVE comparire
 *    in `optimizeDeps.include`. Se qualcuno li rimuove pensando che siano
 *    "dead config", il test fallisce con messaggio che linka all'hotfix.
 */
describe('Globe3D module', () => {
  it('imports cleanly with a default export', async () => {
    const mod = await import('./Globe3D');
    expect(mod).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});

describe('vite.config.ts pre-bundle sentinel — CJS/UMD legacy 3D chain', () => {
  // Ognuno di questi pacchetti è un CJS legacy nella catena di dep di
  // react-globe.gl (vedi `node /tmp/scan-cjs.mjs` o ripeti lo scan
  // controllando i package.json delle sub-dep di three-globe). Devono
  // essere forzati in `optimizeDeps.include` o il dev server cracka su
  // import default.
  const REQUIRED_INCLUDES = [
    // Confermati come runtime imports da consumer excluded:
    'frame-ticker', // three-globe.mjs `import _FT from 'frame-ticker'`
    'prop-types', // react-globe.gl.mjs:3 `import PropTypes from 'prop-types'`
    // Transitive: pre-bundlati indirettamente dai sopra, ma li elenchiamo
    // per difesa contro futuri re-bundle dei consumer principali.
    'react-is',
    'simplesignal',
  ];

  const config = readFileSync(
    join(__dirname, '..', '..', '..', 'vite.config.ts'),
    'utf-8',
  );

  for (const pkg of REQUIRED_INCLUDES) {
    it(`keeps "${pkg}" inside optimizeDeps.include (regression: UMD interop)`, () => {
      // Match generoso: la stringa deve comparire o tra single quote o tra
      // double quote. Se il file viene riformattato, l'identificativo basta.
      const present =
        config.includes(`'${pkg}'`) || config.includes(`"${pkg}"`);
      expect(
        present,
        `${pkg} MUST be listed in optimizeDeps.include — see PR #13 ` +
          'fix/frame-ticker-compat for the structural diagnosis',
      ).toBe(true);
    });
  }

  it('locks the explicit esbuildOptions.mainFields order (module before main)', () => {
    // Senza override esplicito, Vite usa già ['module', 'main', 'browser'].
    // Lo blocchiamo qui per sopravvivere a un eventuale cambio di default
    // upstream, perché un ordine inverso re-introdurrebbe il bug originale.
    expect(config).toMatch(/mainFields:\s*\[\s*['"]module['"]\s*,\s*['"]main['"]/);
  });
});
