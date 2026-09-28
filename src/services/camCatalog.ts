import { del, keys } from 'idb-keyval';
import { getCached, getCachedAny, setCached, type CachedResult } from '@/lib/apiCache';
import catalogMeta from './camCatalogMeta.json';
import { isValidLatLon } from '@/utils/coords';
import {
  CAM_SOURCES,
  isCamSourceId,
  isValidCamId,
  isValidCamPoster,
  isValidCamStream,
  type CamSourceId,
  type CamType,
} from './camSources';

/**
 * Catalogo statico del layer CAM (`public/cam/cams-v2.json`, generato da
 * `scripts/buildCamCatalog.mjs`). Tuple:
 *   SNAP  [source, id, lat, lon, name, "S"]
 *   LIVE  [source, id, lat, lon, name, "L", streamRef, posterRef]
 *
 *  - Scaricato SOLO quando l'utente accende CAM (mai precachato dal SW).
 *  - Una sola richiesta condivisa fra 2D, 3D e card (promise in memoria).
 *  - Cache idb-keyval legata alla VERSIONE del catalogo: chiave
 *    `cam:catalog:<hash>`, con l'hash incluso nel build (camCatalogMeta.json).
 *    Nuova build con catalogo diverso → nuova chiave → richiesta immediata.
 *    Si salva solo un catalogo con l'hash atteso; le voci CAM precedenti
 *    vengono eliminate. Offline: ultima copia CAM disponibile (stale).
 *  - Ogni record è rivalidato: sorgente nota, tipo coerente con la fonte, id,
 *    poster e stream nei pattern della fonte, coordinate valide. Nessun URL è
 *    letto dal JSON.
 */

export interface Cam {
  source: CamSourceId;
  id: string;
  lat: number;
  lon: number;
  name: string;
  /** live = video reale · snap = immagine periodica. */
  type: CamType;
  /** Riferimento dello stream (solo live). */
  stream?: string;
  /** Riferimento del poster (solo fonti che lo separano dall'id). */
  poster?: string;
}

export interface CamCatalog {
  hash: string;
  cams: Cam[];
  /** Record scartati dalla validazione runtime (atteso 0). */
  rejected: number;
}

export const CAM_CATALOG_URL = '/EarthRadar/cam/cams-v2.json';
/** Prefisso delle voci IndexedDB del catalogo CAM (e solo di quello). */
export const CAM_CATALOG_CACHE_PREFIX = 'cam:catalog:';
const TTL_MS = 24 * 60 * 60 * 1000;

/** Hash del catalogo con cui è stata costruita questa build. */
let expectedHash: string = catalogMeta.hash;

/** Chiave IndexedDB del catalogo per una versione (hash). */
export function camCatalogCacheKey(hash: string = expectedHash): string {
  return `${CAM_CATALOG_CACHE_PREFIX}${hash}`;
}
const MAX_NAME = 100;

/** Chiave stabile di una camera (store, dedup, React key). */
export function camKey(source: string, id: string): string {
  return `${source}:${id}`;
}

/** Valida il JSON del catalogo; i record non validi vengono scartati, mai corretti. */
export function parseCamCatalog(json: unknown): CamCatalog {
  const root = json as { v?: unknown; hash?: unknown; cams?: unknown } | null;
  if (!root || root.v !== 2 || !Array.isArray(root.cams)) {
    throw new Error('cam catalog: formato non riconosciuto');
  }
  const seen = new Set<string>();
  const cams: Cam[] = [];
  let rejected = 0;
  for (const row of root.cams) {
    if (!Array.isArray(row) || (row.length !== 6 && row.length !== 8)) {
      rejected++;
      continue;
    }
    const [source, id, lat, lon, name, kind, stream, poster] = row as unknown[];
    if (
      !isCamSourceId(source) ||
      !isValidCamId(source, id) ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !isValidLatLon(lat, lon) ||
      typeof name !== 'string' ||
      name.trim() === ''
    ) {
      rejected++;
      continue;
    }
    // Il tipo deve coincidere con quello dichiarato dalla fonte: una fonte SNAP
    // non può diventare LIVE (né viceversa) modificando il JSON.
    const type: CamType = kind === 'L' ? 'live' : kind === 'S' ? 'snap' : ('?' as CamType);
    if (type !== CAM_SOURCES[source].type) {
      rejected++;
      continue;
    }
    if (type === 'live') {
      if (row.length !== 8 || !isValidCamStream(source, stream) || !isValidCamPoster(source, poster)) {
        rejected++;
        continue;
      }
    } else if (row.length !== 6) {
      rejected++;
      continue;
    }
    const key = camKey(source, id);
    if (seen.has(key)) {
      rejected++;
      continue;
    }
    seen.add(key);
    cams.push(
      type === 'live'
        ? {
            source,
            id,
            lat,
            lon,
            name: name.slice(0, MAX_NAME),
            type,
            stream: stream as string,
            ...(poster ? { poster: poster as string } : {}),
          }
        : { source, id, lat, lon, name: name.slice(0, MAX_NAME), type },
    );
  }
  return { hash: typeof root.hash === 'string' ? root.hash : '', cams, rejected };
}

async function fetchCatalog(): Promise<CamCatalog> {
  const res = await fetch(CAM_CATALOG_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`cam catalog HTTP ${res.status}`);
  return parseCamCatalog(await res.json());
}

/**
 * La cache è un'ottimizzazione, non un requisito: ogni operazione IndexedDB ha
 * un tempo massimo. IndexedDB bloccata/lenta = cache mancante, si usa la rete.
 */
const IDB_TIMEOUT_MS = 1500;
function idb<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), IDB_TIMEOUT_MS);
    op().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Voci IndexedDB del catalogo CAM diverse da `keep` (nessun'altra funzione EarthRadar). */
async function otherCatalogKeys(keep: string): Promise<string[]> {
  try {
    const all = await idb(() => keys(), [] as IDBValidKey[]);
    return all
      .filter((k): k is string => typeof k === 'string' && k.startsWith(CAM_CATALOG_CACHE_PREFIX))
      .filter((k) => k !== keep);
  } catch {
    return [];
  }
}

/** Elimina le vecchie versioni del catalogo CAM (mai le cache di altre funzioni). */
async function pruneOldCatalogs(keep: string): Promise<void> {
  for (const k of await otherCatalogKeys(keep)) {
    await idb(() => del(k), undefined); // errore/blocco: ripulita al prossimo salvataggio
  }
}

/** Ultima copia CAM disponibile (versione corrente scaduta o versione precedente). */
async function anyCachedCatalog(key: string): Promise<CamCatalog | null> {
  const current = await idb(() => getCachedAny<CamCatalog>(key), null);
  if (current) return current;
  for (const k of await otherCatalogKeys(key)) {
    const old = await idb(() => getCachedAny<CamCatalog>(k), null);
    if (old) return old;
  }
  return null;
}

async function loadVersioned(): Promise<CachedResult<CamCatalog>> {
  const key = camCatalogCacheKey();
  const cached = await idb(() => getCached<CamCatalog>(key), null);
  if (cached) return { value: cached, source: 'fresh', fetchedAt: Date.now() };
  try {
    const catalog = await fetchCatalog();
    // Si memorizza solo la versione attesa: una copia vecchia (es. ancora in
    // qualche cache intermedia) viene mostrata ma non "fissata" per 24 h.
    if (catalog.hash === expectedHash) {
      // Salvataggio e pulizia in background: il catalogo si mostra subito.
      pendingSave = idb(() => setCached(key, catalog, TTL_MS), undefined).then(() => pruneOldCatalogs(key));
    }
    return { value: catalog, source: 'fresh', fetchedAt: Date.now() };
  } catch (err) {
    const fallback = await anyCachedCatalog(key);
    if (fallback) return { value: fallback, source: 'stale', fetchedAt: Date.now() };
    throw err;
  }
}

let inflight: Promise<CachedResult<CamCatalog>> | null = null;
let pendingSave: Promise<void> = Promise.resolve();

/**
 * Carica il catalogo (una sola richiesta per sessione, condivisa). In caso di
 * errore la promise viene azzerata, così un nuovo ON può riprovare.
 */
export function loadCamCatalog(): Promise<CachedResult<CamCatalog>> {
  if (!inflight) {
    inflight = loadVersioned().catch((err) => {
      inflight = null;
      throw err;
    });
  }
  return inflight;
}

/** Solo per i test: attende il salvataggio in background del catalogo. */
export function __camCatalogSavedForTests(): Promise<void> {
  return pendingSave;
}

/** Solo per i test: azzera la sessione e, opzionalmente, simula un'altra build. */
export function __resetCamCatalogForTests(buildHash?: string): void {
  inflight = null;
  expectedHash = buildHash ?? catalogMeta.hash;
}
