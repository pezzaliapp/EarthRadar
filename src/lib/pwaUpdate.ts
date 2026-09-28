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
 *
 *
 * CDN DAVANTI A GITHUB PAGES: tiene `sw.js` in cache per ore, quindi il
 * controllo aggiornamenti del browser riceveva il service worker vecchio.
 *  3. Il SW è registrato con un URL per build (`sw.js?v=<id>`), mai in cache.
 *  4. Al `controllerchange` si ricarica solo se la pagina è di un'altra build.
 *  5. App installata / scheda lasciata aperta (nessuna navigazione): al ritorno
 *     in primo piano si confronta l'app shell pubblicata con quella in uso.
 * L'app shell va in rete per prima: vedi vite.config.ts.
 */

/** Identificativo della build (iniettato da vite.config.ts). */
export const BUILD_ID: string = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev';
/** Base path dell'app ("/EarthRadar/"). */
const APP_BASE: string = import.meta.env.BASE_URL ?? '/';

/** URL del service worker per una build: cambia a ogni release. */
export function serviceWorkerUrl(base: string = APP_BASE, buildId: string = BUILD_ID): string {
  return `${base}sw.js?v=${encodeURIComponent(buildId)}`;
}

/** true se `scriptURL` è il service worker di `buildId`. */
export function isWorkerOfBuild(scriptURL: string | undefined | null, buildId: string = BUILD_ID): boolean {
  return !!scriptURL?.endsWith(`sw.js?v=${encodeURIComponent(buildId)}`);
}

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
  controller: { scriptURL?: string } | null | unknown;
  addEventListener: (type: 'controllerchange', listener: () => void) => void;
  register?: (url: string, opts?: RegistrationOptions) => Promise<unknown>;
}
interface NavigatorLike {
  serviceWorker?: SwContainerLike;
}

/**
 * Registra il service worker di QUESTA build (`sw.js?v=<id>`) all'evento `load`
 * (i moduli ES vengono eseguiti sempre prima di `load`).
 * `updateViaCache: 'none'`: nessuna cache HTTP per il controllo aggiornamenti.
 */
export function registerServiceWorker(
  nav: NavigatorLike = typeof navigator !== 'undefined' ? navigator : {},
  win: Pick<Window, 'addEventListener'> | null = typeof window !== 'undefined' ? window : null,
  base: string = APP_BASE,
  buildId: string = BUILD_ID,
): void {
  const sw = nav.serviceWorker;
  if (!sw?.register || !win) return;
  win.addEventListener('load', () => {
    sw.register!(serviceWorkerUrl(base, buildId), { scope: base, updateViaCache: 'none' })?.catch?.(() => {
      /* offline o non supportato: resta la versione in uso */
    });
  });
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
  buildId: string = BUILD_ID,
): void {
  const sw = nav.serviceWorker;
  if (!sw || typeof sw.addEventListener !== 'function') return;
  const hadController = Boolean(sw.controller);
  let reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    // Il nuovo SW è quello di questa stessa build: pagina già aggiornata, niente reload.
    const ctrl = sw.controller as { scriptURL?: string } | null;
    if (isWorkerOfBuild(ctrl?.scriptURL, buildId)) return;
    reloaded = true;
    reload();
  });
}

// ─── Controllo release al ritorno in primo piano ─────────────────────────

/** Distanza minima tra due controlli; una pagina appena caricata non ricontrolla (anti-loop). */
export const RELEASE_CHECK_MIN_GAP_MS = 10 * 60_000;
/** Controllo periodico mentre l'app resta aperta e visibile. */
export const RELEASE_CHECK_INTERVAL_MS = 60 * 60_000;

/** Nome del file d'ingresso (assets/index-<hash>.js) di un HTML o di un URL. */
export function entryOf(htmlOrSrc: string | null | undefined): string | null {
  const m = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(htmlOrSrc ?? '');
  return m ? m[0] : null;
}

export interface ReleaseCheckDeps extends ReloadDeps {
  fetchImpl?: typeof fetch;
  base?: string;
  currentEntry?: string | null;
}

/**
 * Confronta l'app shell pubblicata con quella in esecuzione. Se la release è
 * cambiata ricarica UNA volta (stessa guardia anti-loop dei chunk obsoleti).
 * Offline/errore: non fa nulla.
 */
export async function checkForNewRelease(
  deps: ReleaseCheckDeps = {},
): Promise<'same' | 'reloaded' | 'suppressed' | 'unknown'> {
  const f = deps.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  const base = deps.base ?? APP_BASE;
  const now = deps.now ?? Date.now();
  const current =
    deps.currentEntry !== undefined
      ? entryOf(deps.currentEntry)
      : entryOf(
          typeof document !== 'undefined'
            ? document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
            : null,
        );
  if (!f || !current) return 'unknown';
  let latest: string | null = null;
  try {
    const res = await f(`${base}index.html?release-check=${now}`, { cache: 'no-store' });
    if (!res.ok) return 'unknown';
    latest = entryOf(await res.text());
  } catch {
    return 'unknown'; // offline: si continua con la versione disponibile
  }
  if (!latest || latest === current) return 'same';
  return reloadForChunkError({ storage: deps.storage, now, reload: deps.reload }) ? 'reloaded' : 'suppressed';
}

/**
 * Controlla la release quando l'app torna in primo piano, quando torna la
 * rete e ogni ora mentre resta visibile (con distanza minima tra i controlli).
 */
export function setupReleaseCheck(
  win: Pick<Window, 'addEventListener' | 'setInterval'> | null = typeof window !== 'undefined' ? window : null,
  doc: Pick<Document, 'addEventListener' | 'visibilityState'> | null = typeof document !== 'undefined' ? document : null,
  check: () => Promise<unknown> = () => checkForNewRelease(),
  clock: () => number = () => Date.now(),
): void {
  if (!win || !doc) return;
  let lastCheck = clock(); // la pagina è appena stata caricata: è già la più recente
  const maybeCheck = () => {
    if (doc.visibilityState === 'hidden') return;
    const now = clock();
    if (now - lastCheck < RELEASE_CHECK_MIN_GAP_MS) return;
    lastCheck = now;
    void check();
  };
  doc.addEventListener('visibilitychange', maybeCheck);
  win.addEventListener('online', maybeCheck);
  win.setInterval(maybeCheck, RELEASE_CHECK_INTERVAL_MS);
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
