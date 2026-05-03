import { getCachedAny, setCached, type CacheSource } from '@/lib/apiCache';

/**
 * wheretheiss.at — endpoint live ISS (no key, JSON, CORS open).
 * Doc: https://wheretheiss.at/w/developer
 *
 * Pattern unico nell'app:
 *  - poll 10s con TTL 10s
 *  - "last known good" sempre disponibile: se la fetch fallisce
 *    (timeout, 5xx, offline) torna l'ultimo stato riuscito con
 *    `source: 'stale'`. Per l'ISS la posizione di 30s fa vale molto più
 *    di un array vuoto: il marker resta dov'era e l'utente non vede flicker.
 *  - se non c'è nulla in cache (primo lancio offline) → null.
 */

const ENDPOINT = 'https://api.wheretheiss.at/v1/satellites/25544';
const TTL_MS = 10_000;
const CACHE_KEY = 'earthradar:iss:state';

export interface IssState {
  /** Latitudine in gradi (-90..90). */
  lat: number;
  /** Longitudine in gradi (-180..180). */
  lon: number;
  /** Quota sopra il geoide in km. */
  altKm: number;
  /** Velocità in km/h. */
  velocityKmh: number;
  /** 'daylight' | 'eclipsed' (true = ISS illuminata dal sole). */
  visibility: 'daylight' | 'eclipsed';
  /** Footprint in km (ground swath). */
  footprintKm: number;
  /** Timestamp UTC ms del fix. */
  timestamp: number;
}

export interface IssResult {
  value: IssState | null;
  source: CacheSource | 'pending';
  fetchedAt: number;
}

interface RawWtia {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  velocity?: number;
  visibility?: string;
  footprint?: number;
  timestamp?: number;
}

export function parseWtiaResponse(input: unknown): IssState | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as RawWtia;
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  const altKm = Number(r.altitude);
  const velocityKmh = Number(r.velocity);
  const footprintKm = Number(r.footprint);
  const tsec = Number(r.timestamp);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(altKm) ||
    !Number.isFinite(velocityKmh) ||
    !Number.isFinite(tsec)
  ) {
    return null;
  }
  const visibility: IssState['visibility'] =
    r.visibility === 'eclipsed' ? 'eclipsed' : 'daylight';
  return {
    lat,
    lon,
    altKm,
    velocityKmh,
    footprintKm: Number.isFinite(footprintKm) ? footprintKm : 0,
    visibility,
    timestamp: tsec * 1000,
  };
}

/**
 * Fetch ISS live. Strategy:
 *   1. Cache fresh entro TTL → ritorna `fresh`.
 *   2. Network → memorizza ed esce `fresh`.
 *   3. Errore network ma cache stale presente → `stale`.
 *   4. Niente cache → null + `pending`.
 */
export async function fetchIssState(): Promise<IssResult> {
  const fetchedAt = Date.now();
  const cached = await getCachedAny<IssState>(CACHE_KEY);
  // 1. Cache fresca?
  if (cached && fetchedAt - cached.timestamp < TTL_MS) {
    return { value: cached, source: 'fresh', fetchedAt };
  }
  // 2. Tenta network.
  try {
    const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`ISS HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const parsed = parseWtiaResponse(json);
    if (!parsed) throw new Error('ISS payload malformed');
    await setCached(CACHE_KEY, parsed, TTL_MS);
    return { value: parsed, source: 'fresh', fetchedAt };
  } catch {
    // 3. Last known good?
    if (cached) return { value: cached, source: 'stale', fetchedAt };
    // 4. Nulla disponibile.
    return { value: null, source: 'pending', fetchedAt };
  }
}
