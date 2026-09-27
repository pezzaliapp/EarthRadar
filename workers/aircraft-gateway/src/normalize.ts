import { MAX_POSITION_AGE_S } from './config.ts';
import type { AircraftDTO, NormalizeStats, PositionSource, TrackSource } from './types.ts';

/**
 * Normalizzazione ADSB.lol (formato readsb `/v2/*`) → AircraftDTO.
 *
 * Regole:
 *  - nessun valore stimato: un campo assente resta `null`;
 *  - lat/lon obbligatori e validi, altrimenti l'aereo è scartato;
 *  - posizioni più vecchie di `maxPositionAgeS` scartate;
 *  - direzione: track → true_heading → calc_track (mai mag_heading);
 *  - LADD / PIA (dbFlags) → callsign e registrazione oscurati.
 */

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FPM_TO_MS = 0.00508;

/** Bit di `dbFlags` (readsb): 1 militare, 2 interessante, 4 PIA, 8 LADD. */
export const DB_FLAG_PIA = 4;
export const DB_FLAG_LADD = 8;

const HEX_RE = /^~?[0-9a-f]{6}$/i;
const SQUAWK_RE = /^[0-7]{4}$/;
const CATEGORY_RE = /^[A-D][0-7]$/;

export class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPayloadError';
  }
}

export interface NormalizeOptions {
  maxPositionAgeS?: number;
}

export interface NormalizedAircraftList {
  providerTime: number | null;
  aircraft: AircraftDTO[];
  stats: NormalizeStats;
}

type RawAircraft = Record<string, unknown>;

type ItemResult = { ok: true; value: AircraftDTO } | { ok: false; reason: 'invalid' | 'stale' };

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  const out = Math.round(v * f) / f;
  return Object.is(out, -0) ? 0 : out;
}

function cleanString(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= maxLen ? s : null;
}

function angle(v: unknown): number | null {
  const n = finite(v);
  if (n === null) return null;
  const a = round(((n % 360) + 360) % 360, 1);
  return a >= 360 ? 0 : a;
}

export function mapPositionSource(type: unknown): PositionSource {
  if (typeof type !== 'string') return 'other';
  if (type.startsWith('adsb_') || type.startsWith('adsr_')) return 'adsb';
  if (type === 'mlat') return 'mlat';
  if (type.startsWith('tisb_')) return 'tisb';
  if (type === 'mode_s') return 'modes';
  return 'other';
}

export function pickTrack(raw: RawAircraft): {
  trackDeg: number | null;
  trackSource: TrackSource | null;
} {
  const order: TrackSource[] = ['track', 'true_heading', 'calc_track'];
  for (const key of order) {
    const a = angle(raw[key]);
    if (a !== null) return { trackDeg: a, trackSource: key };
  }
  return { trackDeg: null, trackSource: null };
}

export function isPrivacyRestricted(dbFlags: unknown): boolean {
  const flags = finite(dbFlags);
  if (flags === null || !Number.isInteger(flags)) return false;
  return (flags & (DB_FLAG_PIA | DB_FLAG_LADD)) !== 0;
}

export function normalizeAdsbLolAircraft(raw: unknown, opts: NormalizeOptions = {}): ItemResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, reason: 'invalid' };
  const a = raw as RawAircraft;

  const hex = typeof a.hex === 'string' ? a.hex.trim() : '';
  if (!HEX_RE.test(hex)) return { ok: false, reason: 'invalid' };

  const lat = finite(a.lat);
  const lon = finite(a.lon);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false, reason: 'invalid' };
  }

  const maxAge = opts.maxPositionAgeS ?? MAX_POSITION_AGE_S;
  const seenPos = finite(a.seen_pos);
  if (seenPos !== null && seenPos > maxAge) return { ok: false, reason: 'stale' };

  let onGround = false;
  let altBaroM: number | null = null;
  if (a.alt_baro === 'ground') onGround = true;
  else {
    const ft = finite(a.alt_baro);
    if (ft !== null) altBaroM = Math.round(ft * FT_TO_M);
  }
  const geomFt = finite(a.alt_geom);
  const altGeomM = geomFt === null ? null : Math.round(geomFt * FT_TO_M);

  const gs = finite(a.gs);
  const groundSpeedMs = gs === null || gs < 0 ? null : round(gs * KT_TO_MS, 1);

  const rateFpm = finite(a.baro_rate) ?? finite(a.geom_rate);
  const verticalRateMs = rateFpm === null ? null : round(rateFpm * FPM_TO_MS, 2);

  const squawk = typeof a.squawk === 'string' && SQUAWK_RE.test(a.squawk) ? a.squawk : null;
  const emergencyRaw = cleanString(a.emergency, 16)?.toLowerCase() ?? null;
  const emergency = emergencyRaw && emergencyRaw !== 'none' ? emergencyRaw : null;
  const category =
    typeof a.category === 'string' && CATEGORY_RE.test(a.category) ? a.category : null;

  const seen = finite(a.seen);
  const privacyRestricted = isPrivacyRestricted(a.dbFlags);

  return {
    ok: true,
    value: {
      icao24: hex.toLowerCase(),
      callsign: privacyRestricted ? null : cleanString(a.flight, 8),
      registration: privacyRestricted ? null : cleanString(a.r, 12),
      typeCode: cleanString(a.t, 8),
      category,
      lat: round(lat, 5),
      lon: round(lon, 5),
      onGround,
      altBaroM,
      altGeomM,
      groundSpeedMs,
      ...pickTrack(a),
      verticalRateMs,
      squawk,
      emergency,
      positionSource: mapPositionSource(a.type),
      positionAgeS: seenPos === null || seenPos < 0 ? null : round(seenPos, 1),
      lastSeenS: seen === null || seen < 0 ? null : round(seen, 1),
      privacyRestricted,
    },
  };
}

/** Lancia InvalidPayloadError se la struttura di primo livello non è quella attesa. */
export function normalizeAdsbLolResponse(
  input: unknown,
  opts: NormalizeOptions = {},
): NormalizedAircraftList {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidPayloadError('payload is not an object');
  }
  const body = input as Record<string, unknown>;
  if (!Array.isArray(body.ac)) throw new InvalidPayloadError("missing 'ac' array");

  const stats: NormalizeStats = {
    upstreamTotal: body.ac.length,
    dropped: { invalid: 0, stalePosition: 0, duplicate: 0 },
  };
  const seen = new Set<string>();
  const aircraft: AircraftDTO[] = [];
  for (const item of body.ac) {
    const r = normalizeAdsbLolAircraft(item, opts);
    if (!r.ok) {
      if (r.reason === 'stale') stats.dropped.stalePosition += 1;
      else stats.dropped.invalid += 1;
      continue;
    }
    if (seen.has(r.value.icao24)) {
      stats.dropped.duplicate += 1;
      continue;
    }
    seen.add(r.value.icao24);
    aircraft.push(r.value);
  }
  return { providerTime: finite(body.now), aircraft, stats };
}
