import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';

/**
 * USGS Earthquake Catalog — feed GeoJSON pubblico.
 * Documentazione: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *
 * TTL 5 minuti come da chiarificazioni / ANALISI_INIZIALE.
 * Endpoint default: terremoti delle ultime 24 h (M ≥ 1.0 circa, varia).
 */

export type QuakeFeed = 'all_hour' | 'all_day' | 'all_week' | 'significant_day' | 'significant_week';

const ENDPOINTS: Record<QuakeFeed, string> = {
  all_hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  all_day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
  all_week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
  significant_day:
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
  significant_week:
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
};

const FALLBACK_URL = '/EarthRadar/fallback-data/usgs-quakes.json';
const TTL_MS = 5 * 60 * 1000;

/** Subset tipizzato della FeatureCollection USGS che effettivamente usiamo. */
export interface UsgsQuakeProperties {
  mag: number | null;
  place: string | null;
  time: number;
  updated: number | null;
  url: string | null;
  detail: string | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: 'green' | 'yellow' | 'orange' | 'red' | null;
  status: string | null;
  tsunami: 0 | 1;
  sig: number | null;
  net: string | null;
  code: string | null;
  ids: string | null;
  sources: string | null;
  type: string | null;
  title: string | null;
}

export interface UsgsQuakeFeature {
  type: 'Feature';
  id: string;
  properties: UsgsQuakeProperties;
  geometry: {
    type: 'Point';
    /** [lon, lat, depthKm] */
    coordinates: [number, number, number];
  };
}

export interface UsgsFeatureCollection {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: UsgsQuakeFeature[];
}

/** Modello normalizzato che usa la UI. */
export interface Quake {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  depthKm: number;
  lat: number;
  lon: number;
  url: string | null;
  tsunami: boolean;
  alert: UsgsQuakeProperties['alert'];
  significance: number | null;
  title: string;
}

/**
 * Parser difensivo: accetta una FeatureCollection USGS, scarta feature malformate,
 * normalizza in Quake[]. Pensato per gestire feed parziali e differenze di shape.
 */
export function parseUsgsFeatureCollection(input: unknown): Quake[] {
  if (!input || typeof input !== 'object') return [];
  const fc = input as Partial<UsgsFeatureCollection>;
  if (!Array.isArray(fc.features)) return [];
  const out: Quake[] = [];
  for (const f of fc.features) {
    const q = featureToQuake(f);
    if (q) out.push(q);
  }
  // ordine cronologico inverso (più recente prima) per stabilità output
  out.sort((a, b) => b.time - a.time);
  return out;
}

function featureToQuake(f: unknown): Quake | null {
  if (!f || typeof f !== 'object') return null;
  const feat = f as Partial<UsgsQuakeFeature>;
  if (!feat.id || !feat.properties || !feat.geometry) return null;
  const coords = feat.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const depth = Number(coords[2] ?? 0);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const p = feat.properties;
  const mag = p.mag === null || p.mag === undefined ? NaN : Number(p.mag);
  if (!Number.isFinite(mag)) return null;
  const time = Number(p.time ?? 0);
  if (!Number.isFinite(time) || time <= 0) return null;
  return {
    id: feat.id,
    magnitude: mag,
    place: p.place ?? '',
    time,
    depthKm: Number.isFinite(depth) ? depth : 0,
    lat,
    lon,
    url: p.url ?? null,
    tsunami: Boolean(p.tsunami),
    alert: p.alert ?? null,
    significance: p.sig ?? null,
    title: p.title ?? `M ${mag.toFixed(1)} — ${p.place ?? '—'}`,
  };
}

async function fetchFallback(): Promise<Quake[]> {
  try {
    const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    return parseUsgsFeatureCollection(json);
  } catch {
    return [];
  }
}

export interface FetchQuakesOpts {
  feed?: QuakeFeed;
  /** Se true, bypass cache (debug). */
  force?: boolean;
}

export async function fetchQuakes(opts: FetchQuakesOpts = {}): Promise<CachedResult<Quake[]>> {
  const feed: QuakeFeed = opts.feed ?? 'all_day';
  const url = ENDPOINTS[feed];
  return cachedFetchTraced<Quake[]>({
    key: `earthradar:usgs:${feed}${opts.force ? `:f${Date.now()}` : ''}`,
    ttlMs: TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, { headers: { Accept: 'application/geo+json,application/json' } });
      if (!res.ok) throw new Error(`USGS ${feed} HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      return parseUsgsFeatureCollection(json);
    },
    fallback: fetchFallback,
  });
}
