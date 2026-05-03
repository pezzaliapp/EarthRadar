import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';
import { compassGrid, type COMPASS_8 } from '@/utils/geo';

/**
 * Open-Meteo current weather (free, no key).
 * Documentazione: https://open-meteo.com/en/docs
 *
 * Politica:
 *  - cache TTL 15 min via apiCache
 *  - fallback /fallback-data/openmeteo-empty.json (oggetto vuoto)
 *  - fetchGrid esegue 8 chiamate in parallelo (Promise.all) per le 8
 *    direzioni cardinali / intercardinali a `gridStepKm` dal centro
 *
 * NB: per il radar precipitazioni si usa RainViewer (chiarificazione 5),
 *      Open-Meteo qui resta solo per dati point.
 */

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const TTL_MS = 15 * 60 * 1000;
const FALLBACK_URL = '/EarthRadar/fallback-data/openmeteo-empty.json';

/** Variabili `current` richieste a Open-Meteo. */
const CURRENT_VARS = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'precipitation',
  'relative_humidity_2m',
  'pressure_msl',
  'cloud_cover',
  'weather_code',
] as const;

export interface WeatherPoint {
  lat: number;
  lon: number;
  /** Timestamp UNIX ms dell'osservazione. */
  observedAt: number;
  /** Temperatura aria a 2 m, °C. */
  temperatureC: number | null;
  /** Velocità vento a 10 m, km/h (Open-Meteo restituisce km/h di default). */
  windKmh: number | null;
  /** Direzione vento a 10 m, gradi (0 = nord). */
  windDirDeg: number | null;
  /** Precipitazione mm/h o mm nell'ultima ora secondo il timestep. */
  precipMm: number | null;
  /** Umidità relativa %. */
  humidityPct: number | null;
  /** Pressione SLP, hPa. */
  pressureHpa: number | null;
  /** Cloud cover %. */
  cloudCoverPct: number | null;
  /** Weather code WMO, vedi lib/wmoCodes.ts. */
  weatherCode: number | null;
  /** Timezone restituita dall'API (es. "Europe/Rome"). */
  timezone: string;
}

interface RawCurrent {
  current?: {
    time?: string;
    temperature_2m?: number | null;
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
    precipitation?: number | null;
    relative_humidity_2m?: number | null;
    pressure_msl?: number | null;
    cloud_cover?: number | null;
    weather_code?: number | null;
  };
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export function buildCurrentUrl(lat: number, lon: number): string {
  const u = new URL(BASE_URL);
  u.searchParams.set('latitude', lat.toFixed(4));
  u.searchParams.set('longitude', lon.toFixed(4));
  u.searchParams.set('current', CURRENT_VARS.join(','));
  u.searchParams.set('timezone', 'auto');
  return u.toString();
}

/** Parser puro testabile. Restituisce null se mancano dati essenziali. */
export function parseCurrentResponse(input: unknown, fallbackLat = 0, fallbackLon = 0): WeatherPoint | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as RawCurrent;
  const c = r.current;
  if (!c || !c.time) return null;
  const observedAt = Date.parse(c.time);
  if (!Number.isFinite(observedAt)) return null;
  return {
    lat: r.latitude ?? fallbackLat,
    lon: r.longitude ?? fallbackLon,
    observedAt,
    temperatureC: c.temperature_2m ?? null,
    windKmh: c.wind_speed_10m ?? null,
    windDirDeg: c.wind_direction_10m ?? null,
    precipMm: c.precipitation ?? null,
    humidityPct: c.relative_humidity_2m ?? null,
    pressureHpa: c.pressure_msl ?? null,
    cloudCoverPct: c.cloud_cover ?? null,
    weatherCode: c.weather_code ?? null,
    timezone: r.timezone ?? 'UTC',
  };
}

async function fetchFallback(): Promise<WeatherPoint | null> {
  try {
    const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return parseCurrentResponse(json);
  } catch {
    return null;
  }
}

/** Fetch del current weather a un singolo punto. */
export async function fetchCurrent(lat: number, lon: number): Promise<CachedResult<WeatherPoint | null>> {
  const url = buildCurrentUrl(lat, lon);
  return cachedFetchTraced<WeatherPoint | null>({
    key: `earthradar:openmeteo:${lat.toFixed(2)},${lon.toFixed(2)}`,
    ttlMs: TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      return parseCurrentResponse(json, lat, lon);
    },
    fallback: fetchFallback,
  });
}

export interface WeatherCell extends WeatherPoint {
  /** Direzione cardinale ("N", "NE", …). */
  direction: (typeof COMPASS_8)[number]['key'];
  /** Bearing dal centro in gradi. */
  bearingDeg: number;
}

/**
 * Fetcha 8 punti direzionali a `gridStepKm` dal centro, in parallelo.
 * Tollerante: i punti che falliscono vengono filtrati, gli altri restituiti.
 */
export async function fetchGrid(
  centerLat: number,
  centerLon: number,
  gridStepKm = 100,
): Promise<{ cells: WeatherCell[]; failed: number }> {
  const grid = compassGrid(centerLat, centerLon, gridStepKm);
  const settled = await Promise.allSettled(
    grid.map((g) => fetchCurrent(g.lat, g.lon).then((r) => ({ g, r }))),
  );
  const cells: WeatherCell[] = [];
  let failed = 0;
  for (const s of settled) {
    if (s.status !== 'fulfilled') {
      failed++;
      continue;
    }
    const { g, r } = s.value;
    if (!r.value) {
      failed++;
      continue;
    }
    cells.push({ ...r.value, direction: g.key, bearingDeg: g.bearingDeg });
  }
  return { cells, failed };
}
