import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';
import {
  canFetch,
  initialRateLimit,
  maybeRecover,
  on429,
  onOtherError,
  onSuccess,
  type RateLimitState,
} from './openSkyRateLimit';

/**
 * OpenSky Network — stati ADS-B in tempo reale.
 * Endpoint: https://opensky-network.org/api/states/all
 *
 * Auth opzionale via Basic Auth (env VITE_OPENSKY_USERNAME + PASSWORD): aumenta i
 * rate-limit ma non è richiesta. Senza credenziali si usa il tier anonimo.
 *
 * Politica:
 *  - poll 30 s lato hook (cache app TTL 30 s qui)
 *  - 429 → ratelimit FSM (vedi openSkyRateLimit.ts)
 *  - fallback locale `/fallback-data/opensky-empty.json` (lista vuota)
 *
 * Rate-limit stato condiviso a livello modulo: il poll del componente lo
 * consulta tramite `getRateLimit()` per decidere se inviare la richiesta.
 */

export interface Aircraft {
  /** Identificatore ICAO 24-bit (chiave stabile). */
  icao24: string;
  /** Callsign 8 char (può essere stringa vuota se non disponibile). */
  callsign: string;
  /** Nazione di origine secondo OpenSky. */
  originCountry: string;
  /** Latitudine deg. */
  lat: number;
  /** Longitudine deg. */
  lon: number;
  /** Altitudine barometrica in metri (può essere null). */
  baroAltM: number | null;
  /** Altitudine geometrica in metri (può essere null). */
  geoAltM: number | null;
  /** Velocità su orizzonte in m/s. */
  velocityMs: number | null;
  /** Direzione (true track) in gradi 0..360, 0 = nord. */
  headingDeg: number | null;
  /** Vertical rate in m/s, positivo = salita. */
  verticalRateMs: number | null;
  /** True se l'aereo è a terra. */
  onGround: boolean;
  /** Squawk code (4 cifre). */
  squawk: string | null;
  /** Origine del dato: 0 ADS-B, 1 ASTERIX, 2 MLAT, 3 FLARM. */
  positionSource: number;
  /** Timestamp UNIX (s) dell'ultimo contatto. */
  lastContactSec: number;
}

const STATES_URL = 'https://opensky-network.org/api/states/all';
const TTL_MS = 30_000;
const FALLBACK_URL = '/EarthRadar/fallback-data/opensky-empty.json';

let rateLimit: RateLimitState = initialRateLimit();

/** Espone lo stato corrente del rate-limit (read-only). */
export function getRateLimit(): RateLimitState {
  // Auto-recover prima di leggere — così UI e hook vedono `idle` appena scaduto.
  rateLimit = maybeRecover(rateLimit);
  return rateLimit;
}

/** Reset esplicito del rate-limit (uso debug / test). */
export function resetRateLimitForTest(): void {
  rateLimit = initialRateLimit();
}

function applyAuth(headers: Headers) {
  const u = import.meta.env.VITE_OPENSKY_USERNAME?.toString().trim();
  const p = import.meta.env.VITE_OPENSKY_PASSWORD?.toString().trim();
  if (!u || !p) return;
  // Basic Auth: btoa("user:pass"). In Node test environment btoa potrebbe mancare,
  // ma il browser lo ha sempre.
  const token = typeof btoa === 'function' ? btoa(`${u}:${p}`) : Buffer.from(`${u}:${p}`).toString('base64');
  headers.set('Authorization', `Basic ${token}`);
}

/**
 * Tipo difensivo: lo state vector OpenSky ha 17 elementi posizionali ed è un
 * `unknown[]`. Lo restringiamo qui.
 */
type RawState = readonly [
  string, // 0 icao24
  string | null, // 1 callsign (può avere padding)
  string, // 2 origin_country
  number | null, // 3 time_position
  number, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude (m)
  boolean, // 8 on_ground
  number | null, // 9 velocity (m/s)
  number | null, // 10 true_track (deg)
  number | null, // 11 vertical_rate (m/s)
  number[] | null, // 12 sensors
  number | null, // 13 geo_altitude (m)
  string | null, // 14 squawk
  boolean, // 15 spi
  number, // 16 position_source
];

interface RawResponse {
  time: number;
  states: RawState[] | null;
}

/** Parser puro testabile. */
export function parseStateVectorArray(input: unknown): Aircraft[] {
  if (!input || typeof input !== 'object') return [];
  const r = input as Partial<RawResponse>;
  if (!Array.isArray(r.states)) return [];
  const out: Aircraft[] = [];
  for (const sv of r.states) {
    const a = parseStateVector(sv);
    if (a) out.push(a);
  }
  return out;
}

function parseStateVector(sv: unknown): Aircraft | null {
  if (!Array.isArray(sv) || sv.length < 17) return null;
  const icao24 = (sv[0] as string | undefined)?.trim();
  if (!icao24) return null;
  const lon = sv[5] as number | null | undefined;
  const lat = sv[6] as number | null | undefined;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    icao24,
    callsign: (sv[1] as string | null | undefined)?.trim() ?? '',
    originCountry: (sv[2] as string | undefined) ?? '',
    lat,
    lon,
    baroAltM: (sv[7] as number | null | undefined) ?? null,
    onGround: Boolean(sv[8]),
    velocityMs: (sv[9] as number | null | undefined) ?? null,
    headingDeg: (sv[10] as number | null | undefined) ?? null,
    verticalRateMs: (sv[11] as number | null | undefined) ?? null,
    geoAltM: (sv[13] as number | null | undefined) ?? null,
    squawk: (sv[14] as string | null | undefined) ?? null,
    positionSource: (sv[16] as number | undefined) ?? 0,
    lastContactSec: (sv[4] as number | undefined) ?? 0,
  };
}

export interface FetchAircraftResult extends CachedResult<Aircraft[]> {
  /** True quando il fetch è stato saltato perché siamo in cooldown. */
  skippedDueToRateLimit: boolean;
  /** Snapshot del rate-limit al momento del ritorno. */
  rateLimit: RateLimitState;
}

/**
 * Esegue il fetch, aggiornando lo stato rate-limit. Quando saltato per cooldown,
 * restituisce l'ultima cache disponibile (stale o fallback) senza toccare la rete.
 */
export async function fetchAircraft(): Promise<FetchAircraftResult> {
  rateLimit = maybeRecover(rateLimit);
  if (!canFetch(rateLimit)) {
    // Skipped: serviamo l'ultima cache disponibile.
    const cached = await cachedFetchTraced<Aircraft[]>({
      key: 'earthradar:opensky:states',
      ttlMs: 0, // forza il path stale
      fetcher: async () => {
        throw new Error('rate-limited');
      },
      fallback: fetchFallback,
    });
    return { ...cached, skippedDueToRateLimit: true, rateLimit };
  }

  const result = await cachedFetchTraced<Aircraft[]>({
    key: 'earthradar:opensky:states',
    ttlMs: TTL_MS,
    fetcher: async () => {
      const headers = new Headers({ Accept: 'application/json' });
      applyAuth(headers);
      const res = await fetch(STATES_URL, { headers });
      if (res.status === 429) {
        rateLimit = on429(rateLimit);
        throw new Error('OpenSky 429');
      }
      if (!res.ok) {
        rateLimit = onOtherError(rateLimit);
        throw new Error(`OpenSky HTTP ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      rateLimit = onSuccess(rateLimit);
      return parseStateVectorArray(json);
    },
    fallback: fetchFallback,
  });
  return { ...result, skippedDueToRateLimit: false, rateLimit };
}

async function fetchFallback(): Promise<Aircraft[]> {
  try {
    const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    return parseStateVectorArray(json);
  } catch {
    return [];
  }
}
