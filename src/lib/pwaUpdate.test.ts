import { describe, expect, it, vi } from 'vitest';
import {
  isChunkLoadError,
  reloadForChunkError,
  setupServiceWorkerAutoReload,
  setupPreloadErrorReload,
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_COOLDOWN_MS,
} from './pwaUpdate';

/** sessionStorage finto, in-memory. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('isChunkLoadError', () => {
  it('riconosce la firma iOS Safari "Importing a module script failed"', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });
  it('riconosce la firma Chromium', () => {
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/y.js')),
    ).toBe(true);
  });
  it('riconosce la firma Firefox', () => {
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });
  it('riconosce index HTML servito al posto del chunk', () => {
    expect(
      isChunkLoadError(new Error("Expected a JavaScript module but the server responded with a MIME type of 'text/html'. is not a valid javascript mime type")),
    ).toBe(true);
  });
  it('accetta stringhe e oggetti evento con reason/message', () => {
    expect(isChunkLoadError('Importing a module script failed')).toBe(true);
    expect(isChunkLoadError({ reason: new Error('Failed to fetch dynamically imported module') })).toBe(true);
    expect(isChunkLoadError({ message: 'unable to preload CSS for /a.css' })).toBe(true);
  });
  it('NON considera errori runtime normali come chunk error', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined (reading x)'))).toBe(false);
    expect(isChunkLoadError(new TypeError('foo is not a function'))).toBe(false);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

describe('reloadForChunkError — reload singolo + anti-loop', () => {
  it('effettua un solo reload e memorizza il timestamp', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    const ok = reloadForChunkError({ storage, now: 1000, reload });
    expect(ok).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.map.get(CHUNK_RELOAD_KEY)).toBe('1000');
  });

  it('sopprime un secondo reload entro il cooldown (no loop)', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    reloadForChunkError({ storage, now: 1000, reload });
    const second = reloadForChunkError({ storage, now: 1000 + CHUNK_RELOAD_COOLDOWN_MS - 1, reload });
    expect(second).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1); // ancora una sola volta
  });

  it('consente un nuovo reload trascorso il cooldown', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    reloadForChunkError({ storage, now: 1000, reload });
    const later = reloadForChunkError({ storage, now: 1000 + CHUNK_RELOAD_COOLDOWN_MS + 1, reload });
    expect(later).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('quando lo storage è assente usa la guardia in-memory (un reload)', () => {
    const reload = vi.fn();
    const first = reloadForChunkError({ storage: null, reload });
    const second = reloadForChunkError({ storage: null, reload });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/** ServiceWorkerContainer finto con emitter di controllerchange. */
function fakeSw(hasController: boolean) {
  const listeners: Array<() => void> = [];
  return {
    controller: hasController ? {} : null,
    addEventListener: (_t: 'controllerchange', cb: () => void) => void listeners.push(cb),
    emit: () => listeners.forEach((l) => l()),
  };
}

describe('setupServiceWorkerAutoReload', () => {
  it('ricarica una sola volta quando il nuovo SW prende il controllo (aggiornamento)', () => {
    const sw = fakeSw(true); // esisteva già un controller → è un update
    const reload = vi.fn();
    setupServiceWorkerAutoReload({ serviceWorker: sw }, reload);
    sw.emit();
    sw.emit(); // secondo controllerchange
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('NON ricarica al primo install (nessun controller preesistente)', () => {
    const sw = fakeSw(false);
    const reload = vi.fn();
    setupServiceWorkerAutoReload({ serviceWorker: sw }, reload);
    sw.emit();
    expect(reload).not.toHaveBeenCalled();
  });

  it('non lancia eccezioni se serviceWorker è assente', () => {
    const reload = vi.fn();
    expect(() => setupServiceWorkerAutoReload({}, reload)).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('setupPreloadErrorReload', () => {
  it("innesca il reload controllato sull'evento vite:preloadError", () => {
    const target = new EventTarget();
    const storage = fakeStorage();
    const reload = vi.fn();
    setupPreloadErrorReload(target, { storage, now: 42, reload });
    target.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.map.get(CHUNK_RELOAD_KEY)).toBe('42');
  });
});

// ─── Aggiornamento automatico dietro CDN (release A → B) ─────────────────
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  RELEASE_CHECK_MIN_GAP_MS,
  checkForNewRelease,
  entryOf,
  isWorkerOfBuild,
  registerServiceWorker,
  serviceWorkerUrl,
  setupReleaseCheck,
} from './pwaUpdate';

describe('service worker con URL per build', () => {
  it('ogni build ha il suo URL sw.js?v=<id> (la CDN non può servire quello vecchio)', () => {
    expect(serviceWorkerUrl('/EarthRadar/', 'buildA')).toBe('/EarthRadar/sw.js?v=buildA');
    expect(serviceWorkerUrl('/EarthRadar/', 'buildB')).not.toBe(serviceWorkerUrl('/EarthRadar/', 'buildA'));
    expect(isWorkerOfBuild('https://x.it/EarthRadar/sw.js?v=buildB', 'buildB')).toBe(true);
    expect(isWorkerOfBuild('https://x.it/EarthRadar/sw.js', 'buildB')).toBe(false);
    expect(isWorkerOfBuild(undefined, 'buildB')).toBe(false);
  });

  it('registra il SW della build con scope e updateViaCache "none", a pagina caricata', () => {
    const register = vi.fn(() => Promise.resolve());
    const listeners: Record<string, () => void> = {};
    const win = { addEventListener: (t: string, cb: () => void) => void (listeners[t] = cb) };
    registerServiceWorker({ serviceWorker: { controller: null, addEventListener: () => {}, register } }, win as never, '/EarthRadar/', 'buildB');
    expect(register).not.toHaveBeenCalled();
    listeners.load();
    expect(register).toHaveBeenCalledWith('/EarthRadar/sw.js?v=buildB', { scope: '/EarthRadar/', updateViaCache: 'none' });
  });

  it('controllerchange: nessun reload se il nuovo SW è di questa build; reload unico se la pagina è vecchia', () => {
    const listeners: Array<() => void> = [];
    const sw = { controller: { scriptURL: 'https://x.it/EarthRadar/sw.js?v=buildA' } as { scriptURL: string }, addEventListener: (_t: 'controllerchange', cb: () => void) => void listeners.push(cb) };
    const reload = vi.fn();
    setupServiceWorkerAutoReload({ serviceWorker: sw }, reload, 'buildB'); // pagina B aperta
    sw.controller = { scriptURL: 'https://x.it/EarthRadar/sw.js?v=buildB' };
    listeners.forEach((l) => l());
    expect(reload).not.toHaveBeenCalled(); // pagina e SW già coerenti

    const listeners2: Array<() => void> = [];
    const sw2 = { controller: { scriptURL: 'https://x.it/EarthRadar/sw.js' } as { scriptURL: string }, addEventListener: (_t: 'controllerchange', cb: () => void) => void listeners2.push(cb) };
    const reload2 = vi.fn();
    setupServiceWorkerAutoReload({ serviceWorker: sw2 }, reload2, 'buildA'); // pagina A (vecchia)
    sw2.controller = { scriptURL: 'https://x.it/EarthRadar/sw.js?v=buildB' };
    listeners2.forEach((l) => l());
    listeners2.forEach((l) => l());
    expect(reload2).toHaveBeenCalledTimes(1);
  });
});

describe('controllo nuova release (app installata / scheda lasciata aperta)', () => {
  const html = (entry: string) =>
    new Response(`<!doctype html><script type="module" crossorigin src="/EarthRadar/assets/${entry}"></script>`, { status: 200 });

  it('stessa release → nessun reload', async () => {
    const reload = vi.fn();
    const r = await checkForNewRelease({
      fetchImpl: vi.fn(async () => html('index-AAA.js')) as unknown as typeof fetch,
      base: '/EarthRadar/',
      currentEntry: '/EarthRadar/assets/index-AAA.js',
      storage: fakeStorage(),
      reload,
    });
    expect(r).toBe('same');
    expect(reload).not.toHaveBeenCalled();
  });

  it('nuova release pubblicata → UN reload; subito dopo nessun altro (anti-loop)', async () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    const fetchImpl = vi.fn(async () => html('index-BBB.js')) as unknown as typeof fetch;
    const deps = { fetchImpl, base: '/EarthRadar/', currentEntry: '/EarthRadar/assets/index-AAA.js', storage, reload };
    expect(await checkForNewRelease({ ...deps, now: 1_000_000 })).toBe('reloaded');
    expect(storage.map.get(CHUNK_RELOAD_KEY)).toBe('1000000');
    expect(await checkForNewRelease({ ...deps, now: 1_000_000 + 1000 })).toBe('suppressed');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await checkForNewRelease({ ...deps, now: 1_000_000 + CHUNK_RELOAD_COOLDOWN_MS + 1 })).toBe('reloaded');
    // La richiesta di controllo evita ogni cache (query unica + no-store).
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/^\/EarthRadar\/index\.html\?release-check=\d+$/);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('offline / errore → nessun reload, si continua con la versione disponibile', async () => {
    const reload = vi.fn();
    const r = await checkForNewRelease({
      fetchImpl: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
      base: '/EarthRadar/',
      currentEntry: '/EarthRadar/assets/index-AAA.js',
      storage: fakeStorage(),
      reload,
    });
    expect(r).toBe('unknown');
    expect(reload).not.toHaveBeenCalled();
    expect(entryOf('<script src="/EarthRadar/assets/index-C5YAMen9.js">')).toBe('assets/index-C5YAMen9.js');
  });

  it('controlli al ritorno in primo piano / rete tornata, con distanza minima (niente raffiche)', () => {
    const listeners: Record<string, () => void> = {};
    const win = {
      addEventListener: (t: string, cb: () => void) => void (listeners[`w:${t}`] = cb),
      setInterval: vi.fn(),
    };
    let visibility: DocumentVisibilityState = 'visible';
    const doc = {
      addEventListener: (t: string, cb: () => void) => void (listeners[`d:${t}`] = cb),
      get visibilityState() {
        return visibility;
      },
    };
    let now = 0;
    const check = vi.fn(async () => {});
    setupReleaseCheck(win as never, doc as never, check, () => now);
    now = 60_000;
    listeners['d:visibilitychange'](); // troppo presto dopo il caricamento
    expect(check).not.toHaveBeenCalled();
    now = RELEASE_CHECK_MIN_GAP_MS + 1;
    visibility = 'hidden';
    listeners['d:visibilitychange'](); // nascosta: niente
    expect(check).not.toHaveBeenCalled();
    visibility = 'visible';
    listeners['d:visibilitychange'](); // di nuovo visibile dopo il gap → controllo
    expect(check).toHaveBeenCalledTimes(1);
    listeners['w:online']();
    expect(check).toHaveBeenCalledTimes(1); // entro il gap
    now += RELEASE_CHECK_MIN_GAP_MS + 1;
    listeners['w:online'](); // rete tornata dopo il gap → controllo
    expect(check).toHaveBeenCalledTimes(2);
    expect(win.setInterval).toHaveBeenCalledTimes(1);
  });
});

describe('sentinella configurazione PWA (regressione "bloccato sulla release precedente")', () => {
  const cfg = readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8');
  it('app shell dalla rete, non dalla precache; registrazione dal bundle; attivazione immediata', () => {
    expect(cfg).toMatch(/injectRegister:\s*false/);
    expect(cfg).toMatch(/navigateFallback:\s*null/);
    expect(cfg).toMatch(/directoryIndex:\s*null/);
    expect(cfg).toMatch(/skipWaiting:\s*true/);
    expect(cfg).toMatch(/clientsClaim:\s*true/);
    expect(cfg).toMatch(/request\.mode === 'navigate'[\s\S]{0,200}handler:\s*'NetworkOnly'/);
    expect(cfg).toMatch(/precacheFallback:\s*\{\s*fallbackURL:\s*'\/EarthRadar\/index\.html'/);
    expect(cfg).toMatch(/VITE_BUILD_ID/);
    // Il catalogo CAM resta NetworkFirst (nessuna regressione della cache versionata).
    expect(cfg).toMatch(/cacheName:\s*'cam-catalog'/);
  });
});
