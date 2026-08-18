/**
 * pwaUpdate.ts — robustezza dell'aggiornamento PWA.
 *
 * PROBLEMA RISOLTO
 * Con `registerType: 'autoUpdate'` il service worker generato usa
 * `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches`: alla pubblicazione
 * di una nuova release il nuovo SW si attiva subito, prende il controllo della
 * pagina già aperta e cancella la vecchia precache. La pagina "vecchia" ancora
 * in esecuzione tenta però di lazy-importare chunk con hash della build
 * precedente, ora assenti sia in cache sia sul server → l'import dinamico
 * fallisce ("Importing a module script failed" su iOS Safari,
 * "Failed to fetch dynamically imported module" su Chromium, ecc.).
 *
 * SOLUZIONE (senza nuove dipendenze, senza interventi manuali dell'utente)
 *  1. Al `controllerchange` (il nuovo SW che prende il controllo) si effettua
 *     UN SOLO reload controllato, così la pagina ricarica index.html + chunk
 *     coerenti con la nuova release. Nessun reload al primissimo install.
 *  2. Come rete di sicurezza per la finestra di transizione, gli errori di
 *     import dinamico (chunk obsoleto) innescano UN SOLO reload guardato da
 *     sessionStorage, con cooldown anti-loop. Un normale errore runtime NON
 *     provoca reload.
 */

/** Firme d'errore di import dinamico fallito nei vari browser. */
const CHUNK_ERROR_PATTERNS = [
  'importing a module script failed', // Safari / iOS
  'failed to fetch dynamically imported module', // Chromium (Chrome/Edge)
  'error loading dynamically imported module', // Firefox
  'failed to load module script', // variante Chromium (MIME/HTML)
  'unable to preload css', // preload CSS Vite
  'is not a valid javascript mime type', // index HTML servito al posto del chunk
];

/** Estrae il testo del messaggio da Error, stringa, evento o oggetto affine. */
function extractMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const anyErr = error as {
      message?: unknown;
      reason?: unknown;
      error?: unknown;
    };
    if (typeof anyErr.message === 'string') return anyErr.message;
    if (anyErr.reason) return extractMessage(anyErr.reason);
    if (anyErr.error) return extractMessage(anyErr.error);
  }
  return '';
}

/**
 * true se l'errore corrisponde a un fallimento di import dinamico / chunk
 * obsoleto. Distingue questi errori da un normale errore runtime.
 */
export function isChunkLoadError(error: unknown): boolean {
  const msg = extractMessage(error).toLowerCase();
  if (!msg) return false;
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/** Chiave sessionStorage per la guardia anti-loop del reload. */
export const CHUNK_RELOAD_KEY = 'earthradar:chunkReloadAt';
/** Finestra minima tra due reload da chunk obsoleto (anti-loop). */
export const CHUNK_RELOAD_COOLDOWN_MS = 20_000;

export interface ReloadDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: number;
  reload?: () => void;
}

// Guardia in-memory usata solo se sessionStorage non è disponibile.
let inMemoryReloaded = false;

function safeSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // accesso negato (es. modalità privata restrittiva)
  }
}

/**
 * Effettua UN SOLO reload per recuperare da un chunk obsoleto, con guardia
 * anti-loop: se un reload è già avvenuto entro `CHUNK_RELOAD_COOLDOWN_MS` non
 * ne effettua un altro (ritorna false), così un errore reale e persistente non
 * genera un ciclo di ricariche.
 *
 * @returns true se il reload è stato avviato, false se soppresso (anti-loop).
 */
export function reloadForChunkError(deps: ReloadDeps = {}): boolean {
  const now = deps.now ?? Date.now();
  const reload = deps.reload ?? (() => window.location.reload());
  const storage = deps.storage === undefined ? safeSessionStorage() : deps.storage;

  if (!storage) {
    // Nessuno storage: guardia in-memory (un reload per ciclo di vita pagina).
    if (inMemoryReloaded) return false;
    inMemoryReloaded = true;
    reload();
    return true;
  }

  const raw = storage.getItem(CHUNK_RELOAD_KEY);
  const last = raw ? Number(raw) : 0;
  if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_COOLDOWN_MS) {
    return false; // già ricaricato di recente → non ripetere
  }
  storage.setItem(CHUNK_RELOAD_KEY, String(now));
  reload();
  return true;
}

/** Interfaccia minima del ServiceWorkerContainer usata qui (testabile). */
interface SwContainerLike {
  controller: unknown;
  addEventListener: (type: 'controllerchange', listener: () => void) => void;
}
interface NavigatorLike {
  serviceWorker?: SwContainerLike;
}

/**
 * Configura il reload controllato quando un nuovo service worker prende il
 * controllo della pagina (`controllerchange`). Effettua il reload UNA sola
 * volta e solo se esisteva già un controller (quindi è un aggiornamento, non
 * il primo install).
 */
export function setupServiceWorkerAutoReload(
  nav: NavigatorLike = typeof navigator !== 'undefined' ? navigator : {},
  reload: () => void = () => window.location.reload(),
): void {
  const sw = nav.serviceWorker;
  if (!sw || typeof sw.addEventListener !== 'function') return;
  const hadController = Boolean(sw.controller);
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    reload();
  });
}

/**
 * Ascolta l'evento Vite `vite:preloadError` (preload di un modulo dinamico
 * fallito) e innesca il reload controllato anti-loop.
 */
export function setupPreloadErrorReload(
  target: Pick<EventTarget, 'addEventListener'> = window,
  deps: ReloadDeps = {},
): void {
  target.addEventListener('vite:preloadError', () => {
    reloadForChunkError(deps);
  });
}
