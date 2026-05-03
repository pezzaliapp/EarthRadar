import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';
import { haversineKm } from '@/utils/geo';

/**
 * NASA EONET v3 — Earth Observatory Natural Event Tracker.
 * Doc: https://eonet.gsfc.nasa.gov/docs/v3
 *
 * - /events     → eventi naturali con geometry timestampate (Point o Polygon)
 * - /categories → catalogo categorie (cache 24 h)
 *
 * Politica:
 *  - cache events 1 h, categories 24 h
 *  - fallback /fallback-data/eonet-events.json (snapshot statico)
 *  - parser difensivo (scarta geometry / event malformati)
 */

const BASE = 'https://eonet.gsfc.nasa.gov/api/v3';
const EVENTS_TTL_MS = 60 * 60 * 1000;
const CATEGORIES_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_EVENTS_URL = '/EarthRadar/fallback-data/eonet-events.json';

export type EonetGeometryType = 'Point' | 'Polygon';

export interface EonetGeometryPoint {
  type: 'Point';
  date: string;
  /** [lon, lat] — convenzione GeoJSON. */
  coordinates: [number, number];
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
}

export interface EonetGeometryPolygon {
  type: 'Polygon';
  date: string;
  /**
   * GeoJSON polygon: array di linear rings, ognuno è array di [lon, lat].
   * Per uso Leaflet convertiamo in [lat, lon] al momento del render.
   */
  coordinates: Array<Array<[number, number]>>;
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
}

export type EonetGeometry = EonetGeometryPoint | EonetGeometryPolygon;

export interface EonetCategoryRef {
  id: string;
  title: string;
}

export interface EonetSource {
  id: string;
  url: string;
}

export interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  /** ISO timestamp di chiusura, o null se ancora aperto. */
  closed: string | null;
  categories: EonetCategoryRef[];
  sources: EonetSource[];
  /** Geometry ordinate cronologicamente. */
  geometry: EonetGeometry[];
}

export interface EonetCategoryFull {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
}

interface RawGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

interface RawEvent {
  id?: string;
  title?: string;
  description?: string | null;
  link?: string | null;
  closed?: string | null;
  categories?: Array<{ id?: string | number; title?: string }>;
  sources?: Array<{ id?: string; url?: string }>;
  geometry?: RawGeometry[];
}

interface RawEventsResponse {
  title?: string;
  description?: string;
  link?: string;
  events?: RawEvent[];
}

interface RawCategoriesResponse {
  categories?: Array<{
    id?: string | number;
    title?: string;
    description?: string | null;
    link?: string | null;
  }>;
}

// ----------------------------------- Parsers -----------------------------------

function parseGeometry(g: RawGeometry): EonetGeometry | null {
  if (!g || typeof g !== 'object' || !g.date) return null;
  const mag = g.magnitudeValue == null ? null : Number(g.magnitudeValue);
  const unit = g.magnitudeUnit ?? null;
  if (g.type === 'Point') {
    const c = g.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return {
      type: 'Point',
      date: g.date,
      coordinates: [lon, lat],
      magnitudeValue: Number.isFinite(mag as number) ? (mag as number) : null,
      magnitudeUnit: unit,
    };
  }
  if (g.type === 'Polygon') {
    const c = g.coordinates;
    if (!Array.isArray(c)) return null;
    const rings: Array<Array<[number, number]>> = [];
    for (const ring of c) {
      if (!Array.isArray(ring)) continue;
      const points: Array<[number, number]> = [];
      for (const p of ring) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const lon = Number(p[0]);
        const lat = Number(p[1]);
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          points.push([lon, lat]);
        }
      }
      if (points.length >= 3) rings.push(points);
    }
    if (rings.length === 0) return null;
    return {
      type: 'Polygon',
      date: g.date,
      coordinates: rings,
      magnitudeValue: Number.isFinite(mag as number) ? (mag as number) : null,
      magnitudeUnit: unit,
    };
  }
  return null;
}

export function parseEonetEvent(raw: unknown): EonetEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawEvent;
  if (!r.id || !r.title || !Array.isArray(r.geometry)) return null;
  const geometry = r.geometry
    .map(parseGeometry)
    .filter((g): g is EonetGeometry => g !== null)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (geometry.length === 0) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    link: r.link ?? null,
    closed: r.closed ?? null,
    categories: (r.categories ?? [])
      .filter((c) => c && c.id !== undefined && c.title)
      .map((c) => ({ id: String(c.id), title: c.title! })),
    sources: (r.sources ?? [])
      .filter((s) => s && s.id && s.url)
      .map((s) => ({ id: s.id!, url: s.url! })),
    geometry,
  };
}

export function parseEventsResponse(input: unknown): EonetEvent[] {
  if (!input || typeof input !== 'object') return [];
  const r = input as RawEventsResponse;
  if (!Array.isArray(r.events)) return [];
  const out: EonetEvent[] = [];
  for (const raw of r.events) {
    const e = parseEonetEvent(raw);
    if (e) out.push(e);
  }
  return out;
}

export function parseCategoriesResponse(input: unknown): EonetCategoryFull[] {
  if (!input || typeof input !== 'object') return [];
  const r = input as RawCategoriesResponse;
  if (!Array.isArray(r.categories)) return [];
  return r.categories
    .filter((c) => c && c.id !== undefined && c.title)
    .map((c) => ({
      id: String(c.id),
      title: c.title!,
      description: c.description ?? null,
      link: c.link ?? null,
    }));
}

// ----------------------------------- Helpers -----------------------------------

/**
 * Velocità di spostamento in km/h fra geometry Point consecutive di un evento.
 * Restituisce un array lungo `points.length - 1` (vuoto se < 2 Point).
 * I Polygon vengono ignorati (non hanno un "punto" univoco).
 */
export function trackVelocityKmh(geometry: EonetGeometry[]): number[] {
  const points = geometry.filter((g): g is EonetGeometryPoint => g.type === 'Point');
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const distKm = haversineKm(a.coordinates[1], a.coordinates[0], b.coordinates[1], b.coordinates[0]);
    const dtMs = Date.parse(b.date) - Date.parse(a.date);
    const dtH = dtMs / 3_600_000;
    if (!Number.isFinite(dtH) || dtH <= 0) {
      out.push(0);
      continue;
    }
    out.push(distKm / dtH);
  }
  return out;
}

/** Bounding box in formato EONET API: minLon,minLat,maxLon,maxLat. */
export function bboxToParam(bbox: [number, number, number, number]): string {
  return bbox.join(',');
}

// ----------------------------------- Fetchers -----------------------------------

export interface GetEventsOpts {
  status?: 'open' | 'closed' | 'all';
  /** Limite max eventi (default 200). */
  limit?: number;
  /** Solo eventi aggiornati negli ultimi N giorni (1..365). */
  days?: number;
  /** Filtra per categoria (string id come 'wildfires'). */
  categoryIds?: string[];
  /** Bounding box [minLon, minLat, maxLon, maxLat]. */
  bbox?: [number, number, number, number];
}

export async function getEvents(opts: GetEventsOpts = {}): Promise<CachedResult<EonetEvent[]>> {
  const status = opts.status ?? 'open';
  const limit = opts.limit ?? 200;
  const days = opts.days ?? 30;
  const cats = opts.categoryIds ?? [];
  const params = new URLSearchParams({
    status,
    limit: String(limit),
    days: String(days),
  });
  if (cats.length > 0) params.set('category', cats.join(','));
  if (opts.bbox) params.set('bbox', bboxToParam(opts.bbox));
  const url = `${BASE}/events?${params.toString()}`;
  const cacheKey = `earthradar:eonet:events:${params.toString()}`;
  return cachedFetchTraced<EonetEvent[]>({
    key: cacheKey,
    ttlMs: EVENTS_TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`EONET HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      return parseEventsResponse(json);
    },
    fallback: fetchFallback,
  });
}

async function fetchFallback(): Promise<EonetEvent[]> {
  try {
    const res = await fetch(FALLBACK_EVENTS_URL, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    return parseEventsResponse(json);
  } catch {
    return [];
  }
}

export async function getCategories(): Promise<CachedResult<EonetCategoryFull[]>> {
  return cachedFetchTraced<EonetCategoryFull[]>({
    key: 'earthradar:eonet:categories',
    ttlMs: CATEGORIES_TTL_MS,
    fetcher: async () => {
      const res = await fetch(`${BASE}/categories`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`EONET categories HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      return parseCategoriesResponse(json);
    },
    fallback: [],
  });
}
