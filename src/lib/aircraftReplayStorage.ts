import { sameArea, type Observation, type ReplayHistory } from '@/lib/aircraftReplay';

/**
 * Conservazione della storia del replay fra un reload e l'altro, SOLO in
 * sessionStorage (muore con la scheda), SOLO per ricostruire il punto A.
 *
 * La storia salvata non viene mai mostrata come dato attuale: viene
 * agganciata soltanto quando arriva una fotografia reale della STESSA area,
 * e solo se non è più vecchia di 150 s.
 */

export const REPLAY_STORAGE_KEY = 'earthradar:aircraft:replay:v1';
/** Stessa soglia oltre cui i dati non sono più mostrati (30 s + 120 s stale del gateway). */
export const REPLAY_STORAGE_MAX_AGE_MS = 150_000;

interface StoredReplay {
  v: 1;
  /** Istante di salvataggio (orologio del browser). */
  savedAt: number;
  area: ReplayHistory['area'];
  lastFetchedAt: number;
  tracks: Array<[string, Observation[]]>;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveReplay(
  history: ReplayHistory,
  now: number,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const data: StoredReplay = {
    v: 1,
    savedAt: now,
    area: history.area,
    lastFetchedAt: history.lastFetchedAt,
    tracks: [...history.tracks.entries()],
  };
  try {
    storage.setItem(REPLAY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota piena o storage bloccato: il replay riparte semplicemente da zero
  }
}

function isObs(v: unknown): v is Observation {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return n(o.t) && n(o.lat) && n(o.lon) && (o.altM === null || n(o.altM));
}

/** Legge la storia salvata; null se assente, corrotta o più vecchia di 150 s. */
export function loadReplay(
  now: number,
  storage: StorageLike | null = defaultStorage(),
): ReplayHistory | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(REPLAY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as StoredReplay;
    if (d?.v !== 1 || typeof d.savedAt !== 'number' || !Array.isArray(d.tracks)) return null;
    if (now - d.savedAt > REPLAY_STORAGE_MAX_AGE_MS || now < d.savedAt) {
      storage.removeItem(REPLAY_STORAGE_KEY);
      return null;
    }
    const tracks = new Map<string, Observation[]>();
    for (const entry of d.tracks) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Array.isArray(entry[1]))
        continue;
      const obs = entry[1].filter(isObs);
      if (obs.length) tracks.set(entry[0], obs);
    }
    return { area: d.area, lastFetchedAt: d.lastFetchedAt, tracks };
  } catch {
    return null;
  }
}

/**
 * La storia salvata vale come passato solo per una fotografia reale della
 * stessa area e con osservazioni non più vecchie di 150 s rispetto ad essa.
 */
export function restorableFor(
  saved: ReplayHistory | null,
  snapshot: { area: ReplayHistory['area']; fetchedAt: number },
): ReplayHistory | null {
  if (!saved || !saved.area || !sameArea(saved.area, snapshot.area)) return null;
  if (snapshot.fetchedAt - saved.lastFetchedAt > REPLAY_STORAGE_MAX_AGE_MS) return null;
  if (saved.lastFetchedAt > snapshot.fetchedAt) return null;
  return saved;
}
