import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';

/**
 * RainViewer — overlay radar precipitazioni globale, gratuito, no key.
 * Doc: https://www.rainviewer.com/api.html
 *
 * Discovery endpoint: weather-maps.json restituisce
 *  {
 *    host: "https://tilecache.rainviewer.com",
 *    radar: {
 *      past: [{ time: 1700000000, path: "/v2/radar/1700000000" }, ...],
 *      nowcast: [{ time: ..., path: ... }, ...],
 *    }
 *  }
 *
 * Tile URL: <host><path>/<size>/<z>/<x>/<y>/<color>/<options>.png
 *  - size: 256 | 512
 *  - color: 0..8 (palette). 2 = "original", 4 = "Universal Blue".
 *  - options: "<smooth>_<snow>" → es. "0_1" = no smoothing, includi neve
 */

const DISCOVERY_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const DEFAULT_HOST = 'https://tilecache.rainviewer.com';
const TTL_MS = 5 * 60 * 1000;

export interface RadarFrame {
  /** Timestamp UNIX (s). */
  time: number;
  /** Path relativo al host (es. "/v2/radar/1700000000"). */
  path: string;
  /** Categoria del frame: passato, nowcast (futuro). */
  kind: 'past' | 'nowcast';
}

export interface RadarFrames {
  /** Host base dei tile (CDN). */
  host: string;
  past: RadarFrame[];
  nowcast: RadarFrame[];
  /** Tutti i frame ordinati cronologicamente, past poi nowcast. */
  all: RadarFrame[];
  /** Indice del frame "now" (l'ultimo past, o 0 se vuoto). */
  nowIndex: number;
}

const EMPTY_FRAMES: RadarFrames = {
  host: DEFAULT_HOST,
  past: [],
  nowcast: [],
  all: [],
  nowIndex: 0,
};

interface RawDiscovery {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
}

export function parseDiscovery(input: unknown): RadarFrames {
  if (!input || typeof input !== 'object') return EMPTY_FRAMES;
  const r = input as RawDiscovery;
  const host = (r.host ?? DEFAULT_HOST).replace(/\/+$/, '');
  const past = (r.radar?.past ?? [])
    .filter((f) => f && typeof f.time === 'number' && typeof f.path === 'string')
    .map<RadarFrame>((f) => ({ time: f.time, path: f.path, kind: 'past' }))
    .sort((a, b) => a.time - b.time);
  const nowcast = (r.radar?.nowcast ?? [])
    .filter((f) => f && typeof f.time === 'number' && typeof f.path === 'string')
    .map<RadarFrame>((f) => ({ time: f.time, path: f.path, kind: 'nowcast' }))
    .sort((a, b) => a.time - b.time);
  const all = [...past, ...nowcast];
  const nowIndex = past.length > 0 ? past.length - 1 : 0;
  return { host, past, nowcast, all, nowIndex };
}

export interface TileOptions {
  /** Tile size: 256 (default) o 512. */
  size?: 256 | 512;
  /** Palette: 2 = "original" (default), 4 = "Universal Blue". */
  color?: number;
  /** Smoothing on/off. */
  smooth?: boolean;
  /** Include neve (snowMode 1) o solo pioggia (0). */
  snow?: boolean;
}

/** Costruisce l'URL del tile per un frame e le opzioni passate. */
export function buildTileUrl(
  host: string,
  frame: RadarFrame,
  opts: TileOptions = {},
): string {
  const size = opts.size ?? 256;
  const color = opts.color ?? 2;
  const smooth = opts.smooth ? 1 : 0;
  const snow = opts.snow ? 1 : 0;
  // Pattern: {host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
}

/** Fetcha la lista dei frame con cache 5 min. */
export async function fetchRadarFrames(): Promise<CachedResult<RadarFrames>> {
  return cachedFetchTraced<RadarFrames>({
    key: 'earthradar:rainviewer:weather-maps',
    ttlMs: TTL_MS,
    fetcher: async () => {
      const res = await fetch(DISCOVERY_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`RainViewer HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      return parseDiscovery(json);
    },
    fallback: EMPTY_FRAMES,
  });
}

/** Etichetta umana per un frame relativo a `now` (es. "−10 min", "Ora", "+15 min"). */
export function frameLabel(
  frame: RadarFrame,
  nowSec = Math.floor(Date.now() / 1000),
  language: 'it' | 'en' = 'it',
): string {
  const deltaMin = Math.round((frame.time - nowSec) / 60);
  if (deltaMin === 0) return language === 'it' ? 'Ora' : 'Now';
  const sign = deltaMin > 0 ? '+' : '−';
  const abs = Math.abs(deltaMin);
  const suffix = frame.kind === 'nowcast' ? (language === 'it' ? ' nowcast' : ' nowcast') : '';
  return `${sign}${abs} min${suffix}`;
}
