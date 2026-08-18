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
