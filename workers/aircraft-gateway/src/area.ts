import { MAX_RADIUS_NM, RADIUS_BUCKETS_NM } from './config.ts';
import type { Area } from './types.ts';

/**
 * Validazione rigorosa dei parametri `lat`, `lon`, `r` e quantizzazione
 * dell'area, così che client vicini condividano la stessa voce di cache.
 */

export type AreaField = 'lat' | 'lon' | 'r';

export type AreaParseResult =
  | { ok: true; requested: Area; area: Area }
  | { ok: false; field: AreaField; message: string };

const DECIMAL_RE = /^[+-]?(?:\d{1,3}(?:\.\d{1,8})?)$/;
const INTEGER_RE = /^\d{1,3}$/;

function single(params: URLSearchParams, name: AreaField): string | { error: string } {
  const values = params.getAll(name);
  if (values.length === 0) return { error: `missing parameter '${name}'` };
  if (values.length > 1) return { error: `parameter '${name}' must appear once` };
  return values[0] ?? '';
}

function parseDecimal(
  params: URLSearchParams,
  name: 'lat' | 'lon',
  min: number,
  max: number,
): number | { error: string } {
  const raw = single(params, name);
  if (typeof raw !== 'string') return raw;
  if (!DECIMAL_RE.test(raw)) return { error: `'${name}' must be a decimal number` };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { error: `'${name}' must be between ${min} and ${max}` };
  }
  return value;
}

export function parseAreaParams(params: URLSearchParams): AreaParseResult {
  const lat = parseDecimal(params, 'lat', -90, 90);
  if (typeof lat !== 'number') return { ok: false, field: 'lat', message: lat.error };
  const lon = parseDecimal(params, 'lon', -180, 180);
  if (typeof lon !== 'number') return { ok: false, field: 'lon', message: lon.error };

  const rawR = single(params, 'r');
  if (typeof rawR !== 'string') return { ok: false, field: 'r', message: rawR.error };
  if (!INTEGER_RE.test(rawR)) {
    return { ok: false, field: 'r', message: "'r' must be an integer number of nautical miles" };
  }
  const r = Number(rawR);
  if (r < 1 || r > MAX_RADIUS_NM) {
    return { ok: false, field: 'r', message: `'r' must be between 1 and ${MAX_RADIUS_NM}` };
  }

  const requested: Area = { lat, lon, radiusNm: r };
  return { ok: true, requested, area: quantizeArea(requested) };
}

/** Primo gradino >= r (r già validato <= MAX_RADIUS_NM). */
export function radiusBucket(radiusNm: number): number {
  for (const b of RADIUS_BUCKETS_NM) if (radiusNm <= b) return b;
  return MAX_RADIUS_NM;
}

/** Passo della griglia del centro, proporzionale al raggio (spostamento max ≈ passo·0,7). */
export function gridStepDeg(bucketNm: number): number {
  if (bucketNm <= 50) return 0.1;
  if (bucketNm <= 100) return 0.25;
  // 150 NM: griglia larga per massimizzare i cache hit. Scarto max del centro
  // ≈ 21 NM all'equatore, ≈ 18 NM a 45° (≤ 14% del raggio).
  return 0.5;
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const out = Math.round(value * f) / f;
  return Object.is(out, -0) ? 0 : out;
}

/** Longitudine in [-180, 180): 180 e -180 collassano sulla stessa chiave. */
export function wrapLon(lon: number): number {
  const w = ((((lon + 180) % 360) + 360) % 360) - 180;
  return Object.is(w, -0) ? 0 : w;
}

export function quantizeArea(requested: Area): Area {
  const radiusNm = radiusBucket(requested.radiusNm);
  const step = gridStepDeg(radiusNm);
  const lat = Math.min(90, Math.max(-90, Math.round(requested.lat / step) * step));
  const lon = wrapLon(Math.round(requested.lon / step) * step);
  return { lat: roundTo(lat, 4), lon: roundTo(lon, 4), radiusNm };
}

export function areaCacheKey(area: Area): string {
  return `${area.lat},${area.lon},${area.radiusNm}`;
}
