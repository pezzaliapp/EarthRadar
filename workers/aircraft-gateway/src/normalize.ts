import { AnonymousIds } from './anonymize.ts';
import { MAX_POSITION_AGE_S } from './config.ts';
import type { AircraftDTO, NormalizeStats, PositionSource, TrackSource } from './types.ts';

/**
 * Normalizzazione formato readsb (`ac[]`, usato da FlyItalyADSB) → AircraftDTO.
 *
 * Regole:
 *  - nessun valore stimato: un campo assente resta `null`;
 *  - lat/lon obbligatori e validi, altrimenti l'aereo è scartato;
 *  - posizioni più vecchie di `maxPositionAgeS` scartate;
 *  - direzione: track → true_heading → calc_track (mai mag_heading);
 *  - LADD / PIA (dbFlags) → oscuramento completo: callsign, registrazione e
 *    indirizzo ICAO mai esposti; `id` è un token anonimo casuale;
 *  - output ordinato per `id`, così l'ordine upstream (che dipende
 *    dall'indirizzo) non lascia trapelare nulla degli aerei oscurati.
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
  /**
   * Registro dei token anonimi LADD/PIA. Se assente se ne crea uno nuovo
   * per chiamata: token casuali, stabili solo all'interno della risposta.
   */
  anonymousIds?: AnonymousIds;
}

export interface NormalizedAircraftList {
  providerTime: number | null;
  aircraft: AircraftDTO[];
  stats: NormalizeStats;
}

type RawAircraft = Record<string, unknown>;

type ItemResult =
  | { ok: true; value: AircraftDTO; key: string }
  | { ok: false; reason: 'invalid' | 'stale' };

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

export function normalizeReadsbAircraft(raw: unknown, opts: NormalizeOptions = {}): ItemResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, reason: 'invalid' };
  const a = raw as RawAircraft;

  const rawHex = typeof a.hex === 'string' ? a.hex.trim() : '';
  if (!HEX_RE.test(rawHex)) return { ok: false, reason: 'invalid' };
  const hex = rawHex.toLowerCase();

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
  const anon = privacyRestricted ? (opts.anonymousIds ?? new AnonymousIds()) : null;

  return {
    ok: true,
    // Chiave interna per la deduplicazione: mai inclusa nel DTO se oscurato.
    key: hex,
    value: {
      id: anon ? anon.idFor(hex) : hex,
      icao24: privacyRestricted ? null : hex,
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

/**
 * `now` del provider → ms Unix interi. FlyItalyADSB lo invia in secondi con
 * decimali (es. 1790525916.049), altri server readsb in ms: sotto 1e11 (anno
 * 1973 se ms, anno 5138 se s) il valore è in secondi.
 */
export function providerTimeMs(now: unknown): number | null {
  const n = finite(now);
  if (n === null || n <= 0) return null;
  return Math.round(n < 1e11 ? n * 1000 : n);
}

/** Lancia InvalidPayloadError se la struttura di primo livello non è quella attesa. */
export function normalizeReadsbResponse(
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
  const itemOpts: NormalizeOptions = {
    ...opts,
    anonymousIds: opts.anonymousIds ?? new AnonymousIds(),
  };
  const seen = new Set<string>();
  const aircraft: AircraftDTO[] = [];
  for (const item of body.ac) {
    const r = normalizeReadsbAircraft(item, itemOpts);
    if (!r.ok) {
      if (r.reason === 'stale') stats.dropped.stalePosition += 1;
      else stats.dropped.invalid += 1;
      continue;
    }
    if (seen.has(r.key)) {
      stats.dropped.duplicate += 1;
      continue;
    }
    seen.add(r.key);
    aircraft.push(r.value);
  }
  aircraft.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return { providerTime: providerTimeMs(body.now), aircraft, stats };
}
