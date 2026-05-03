import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';

/**
 * NASA FIRMS — Fire Information for Resource Management System.
 * Doc: https://firms.modaps.eosdis.nasa.gov/api/area/
 *
 * Strategia
 *  - endpoint CSV (più leggero del JSON e formato ufficiale FIRMS)
 *  - MAP_KEY in `VITE_FIRMS_MAP_KEY`. Se assente → `firmsMapKey()` ritorna null
 *    e i chiamanti devono cadere sul fallback GIBS Active Fires (vedi useFires).
 *  - bbox formato FIRMS: `west,south,east,north`. Cap massima area 10°×10°
 *    centrata sul viewport (limite indicativo dell'API per evitare i 429).
 *  - cache TTL 30 min via apiCache. Fallback statico (array vuoto) per non
 *    rompere il render quando offline + nessuna key.
 *  - parser CSV in-house (14 colonne note, no dipendenze).
 */

const BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const TTL_MS = 30 * 60 * 1000;
const FALLBACK_URL = '/EarthRadar/fallback-data/firms-empty.json';

export type FirmsSource = 'VIIRS_SNPP_NRT' | 'VIIRS_NOAA20_NRT' | 'MODIS_NRT';

/** Day range supportato da FIRMS (1..7). */
export type FirmsDayRange = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Bounding box [west, south, east, north] in gradi. */
export type FirmsBbox = [number, number, number, number];

export interface FirmsHotspot {
  /** Latitudine in gradi. */
  lat: number;
  /** Longitudine in gradi. */
  lon: number;
  /** Bright temp del canale 4 (Kelvin). 0 se non riportato. */
  brightness: number;
  /** Footprint scan track (km). */
  scan: number;
  /** Footprint along track (km). */
  track: number;
  /** Data acquisizione UTC `YYYY-MM-DD`. */
  acqDate: string;
  /** Ora acquisizione UTC `HHMM`. */
  acqTime: string;
  /** Codice satellite (es. `N` per NOAA-20, `T` per Terra…). */
  satellite: string;
  /** Strumento (`VIIRS`, `MODIS`). */
  instrument: string;
  /**
   * Confidence: per VIIRS è categoria (`l`/`n`/`h`), per MODIS numerica 0..100.
   * Manteniamo string per compatibilità.
   */
  confidence: string;
  /** Versione algoritmo (es. `2.0NRT`). */
  version: string;
  /** Bright temp canale 31 (Kelvin), MODIS only. 0 se assente. */
  brightT31: number;
  /** Fire Radiative Power (MW). */
  frp: number;
  /** `D` = day, `N` = night. */
  dayNight: 'D' | 'N' | string;
}

export interface GetHotspotsOpts {
  source?: FirmsSource;
  dayRange?: FirmsDayRange;
  bbox: FirmsBbox;
}

export interface GetHotspotsResult extends CachedResult<FirmsHotspot[]> {
  /** True se la map key non è configurata (caller deve fallire su GIBS). */
  missingKey: boolean;
}

// ----------------------------------------------------------------------------
// Env + bbox helpers
// ----------------------------------------------------------------------------

/** Map key FIRMS dall'env Vite. Trim, ritorna null se vuota. */
export function firmsMapKey(): string | null {
  const raw = import.meta.env.VITE_FIRMS_MAP_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Clampa un bbox arbitrario ai limiti FIRMS:
 *   - latitudine ∈ [-90, 90]
 *   - longitudine ∈ [-180, 180]
 *   - area max 10°×10° (centrata sul midpoint del bbox originale)
 *
 * Necessario per evitare 429 rate-limit FIRMS in caso di mappa zoomata
 * out al massimo (bbox del mondo).
 */
export function clampFirmsBbox(bbox: FirmsBbox, maxSpanDeg = 10): FirmsBbox {
  let [west, south, east, north] = bbox;
  const cLon = (west + east) / 2;
  const cLat = (south + north) / 2;
  const lonSpan = Math.min(maxSpanDeg, Math.abs(east - west));
  const latSpan = Math.min(maxSpanDeg, Math.abs(north - south));
  west = cLon - lonSpan / 2;
  east = cLon + lonSpan / 2;
  south = cLat - latSpan / 2;
  north = cLat + latSpan / 2;
  west = Math.max(-180, Math.min(180, west));
  east = Math.max(-180, Math.min(180, east));
  south = Math.max(-90, Math.min(90, south));
  north = Math.max(-90, Math.min(90, north));
  if (east < west) [west, east] = [east, west];
  if (north < south) [south, north] = [north, south];
  return [west, south, east, north];
}

/** Formato area param FIRMS: `west,south,east,north`. */
export function firmsAreaParam(bbox: FirmsBbox): string {
  return clampFirmsBbox(bbox).map((n) => n.toFixed(3)).join(',');
}

// ----------------------------------------------------------------------------
// Color scaling per FRP (Fire Radiative Power, MW)
// ----------------------------------------------------------------------------

/**
 * Colore semaforico in base a FRP:
 *   - < 50 MW   → giallo (incendio leggero, hotspot termico)
 *   - 50..200   → arancione (incendio attivo classico)
 *   - > 200 MW  → rosso (incendio severo, megafire)
 */
export function frpColor(frpMw: number): string {
  if (!Number.isFinite(frpMw)) return '#fbbf24';
  if (frpMw < 50) return '#fbbf24';
  if (frpMw <= 200) return '#fb923c';
  return '#ef4444';
}

/** Etichetta breve della severity per i18n / UI. */
export function frpSeverity(frpMw: number): 'low' | 'mid' | 'high' {
  if (!Number.isFinite(frpMw) || frpMw < 50) return 'low';
  if (frpMw <= 200) return 'mid';
  return 'high';
}

// ----------------------------------------------------------------------------
// CSV parser
// ----------------------------------------------------------------------------

/**
 * Header CSV FIRMS atteso (VIIRS NRT usa `bright_ti4`/`bright_ti5`, MODIS NRT
 * usa `brightness`/`bright_t31`). `readField` accetta entrambi.
 * Riferimento: https://firms.modaps.eosdis.nasa.gov/api/area/
 */

/** Tokenizer di una linea CSV semplice (no quoted fields, FIRMS è sicuro). */
function splitCsv(line: string): string[] {
  return line.split(',').map((t) => t.trim());
}

/** Mappa header → indice colonna (case insensitive). */
function buildHeaderMap(headerLine: string): Record<string, number> {
  const cols = splitCsv(headerLine).map((c) => c.toLowerCase());
  const map: Record<string, number> = {};
  cols.forEach((c, i) => {
    map[c] = i;
  });
  return map;
}

function readField(map: Record<string, number>, row: string[], names: string[]): string {
  for (const n of names) {
    const idx = map[n];
    if (idx !== undefined && idx < row.length) {
      const v = row[idx];
      if (v !== undefined && v !== '') return v;
    }
  }
  return '';
}

function rowToHotspot(map: Record<string, number>, row: string[]): FirmsHotspot | null {
  const lat = Number(readField(map, row, ['latitude']));
  const lon = Number(readField(map, row, ['longitude']));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const brightness = Number(readField(map, row, ['bright_ti4', 'brightness']));
  const scan = Number(readField(map, row, ['scan']));
  const track = Number(readField(map, row, ['track']));
  const acqDate = readField(map, row, ['acq_date']);
  const acqTime = readField(map, row, ['acq_time']);
  const satellite = readField(map, row, ['satellite']);
  const instrument = readField(map, row, ['instrument']);
  const confidence = readField(map, row, ['confidence']);
  const version = readField(map, row, ['version']);
  const brightT31 = Number(readField(map, row, ['bright_ti5', 'bright_t31']));
  const frp = Number(readField(map, row, ['frp']));
  const dayNight = readField(map, row, ['daynight']);
  return {
    lat,
    lon,
    brightness: Number.isFinite(brightness) ? brightness : 0,
    scan: Number.isFinite(scan) ? scan : 0,
    track: Number.isFinite(track) ? track : 0,
    acqDate,
    acqTime,
    satellite,
    instrument,
    confidence,
    version,
    brightT31: Number.isFinite(brightT31) ? brightT31 : 0,
    frp: Number.isFinite(frp) ? frp : 0,
    dayNight,
  };
}

/**
 * Parser CSV FIRMS difensivo. Restituisce sempre un array (mai throw).
 * Scarta righe malformate (lat/lon non numerici o mancanti).
 */
export function parseFirmsCsv(csv: string): FirmsHotspot[] {
  if (!csv || typeof csv !== 'string') return [];
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headerMap = buildHeaderMap(lines[0]);
  // Verifica che almeno latitude/longitude siano nell'header.
  if (headerMap['latitude'] === undefined || headerMap['longitude'] === undefined) {
    return [];
  }
  const out: FirmsHotspot[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsv(lines[i]);
    const hs = rowToHotspot(headerMap, row);
    if (hs) out.push(hs);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

/**
 * Scarica gli hotspot FIRMS per il bbox dato.
 * Richiede VITE_FIRMS_MAP_KEY: se assente ritorna `missingKey: true` e il
 * caller deve usare GIBS Active Fires.
 */
export async function getHotspots(opts: GetHotspotsOpts): Promise<GetHotspotsResult> {
  const source = opts.source ?? 'VIIRS_SNPP_NRT';
  const dayRange = opts.dayRange ?? 1;
  const bbox = clampFirmsBbox(opts.bbox);
  const key = firmsMapKey();
  if (!key) {
    return {
      value: [],
      source: 'fallback',
      fetchedAt: Date.now(),
      missingKey: true,
    };
  }
  const area = bbox.map((n) => n.toFixed(3)).join(',');
  const url = `${BASE}/${key}/${source}/${area}/${dayRange}`;
  const cacheKey = `earthradar:firms:${source}:${dayRange}:${area}`;
  const cached = await cachedFetchTraced<FirmsHotspot[]>({
    key: cacheKey,
    ttlMs: TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, { headers: { Accept: 'text/csv' } });
      if (res.status === 429) throw new Error('FIRMS rate-limited');
      if (!res.ok) throw new Error(`FIRMS HTTP ${res.status}`);
      const text = await res.text();
      return parseFirmsCsv(text);
    },
    fallback: fetchFallback,
  });
  return { ...cached, missingKey: false };
}

async function fetchFallback(): Promise<FirmsHotspot[]> {
  try {
    const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    return Array.isArray(json) ? (json as FirmsHotspot[]) : [];
  } catch {
    return [];
  }
}
