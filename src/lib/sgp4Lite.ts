/**
 * Wrapper sottile di `satellite.js` per propagazione SGP4/SDP4 e ground track.
 *
 * Esposto in due modalità:
 *  - per `TleSet` (3 righe): `propagate(tle, date)` / `groundTrack(tle, fromMs, toMs, stepSec)`
 *  - per `Satrec` già parsato (preferita per loop frequenti): `propagateSatrec` / `groundTrackSatrec`
 *
 * Inoltre:
 *  - `parseTle` / `parseTleList` per testo TLE 3-line
 *  - `parseGpRecord` per il formato JSON GP di CelesTrak
 *  - `orbitalElements` per estrarre incl/ecc/period/perigee/apogee senza propagare
 *
 * Tutte le funzioni che ricevono *raw* TLE costruiscono il satrec on-the-fly:
 * dentro un loop ad alta frequenza preferire le varianti `*Satrec`.
 */
import * as satellite from 'satellite.js';

export interface TleSet {
  name: string;
  line1: string;
  line2: string;
}

/** Posizione propagata: lat/lon in gradi, alt in km, optional velocità in km/s. */
export interface PropagatedPosition {
  lat: number;
  lon: number;
  alt: number;
  velocityKms?: number;
  /** Timestamp UNIX in ms del calcolo. */
  t: number;
}

export type Satrec = satellite.SatRec;

const EARTH_R_KM = 6378.137;
const MU = 398600.4418;

// --------------------------------- Parsers ---------------------------------

export function parseTle(text: string): TleSet | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;
  if (!lines[1].startsWith('1 ') || !lines[2].startsWith('2 ')) return null;
  return { name: lines[0], line1: lines[1], line2: lines[2] };
}

export function parseTleList(text: string): TleSet[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sets: TleSet[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (l1.startsWith('1 ') && l2.startsWith('2 ')) {
      sets.push({ name, line1: l1, line2: l2 });
    }
  }
  return sets;
}

/**
 * Subset dei campi GP-JSON di CelesTrak che usiamo. Vedi
 * https://celestrak.org/NORAD/documentation/gp-data-formats.php
 */
export interface GpRecord {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  EPOCH?: string;
  MEAN_MOTION?: number;
  ECCENTRICITY?: number;
  INCLINATION?: number;
  RA_OF_ASC_NODE?: number;
  ARG_OF_PERICENTER?: number;
  MEAN_ANOMALY?: number;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  NORAD_CAT_ID?: number;
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
  BSTAR?: number;
  MEAN_MOTION_DOT?: number;
  MEAN_MOTION_DDOT?: number;
  TLE_LINE0?: string;
  TLE_LINE1?: string;
  TLE_LINE2?: string;
}

/**
 * Converte un GP record CelesTrak in TleSet, ricostruendo le 2 righe TLE.
 * Preferisce TLE_LINE1/TLE_LINE2 se presenti (alcuni endpoint le includono).
 *
 * Necessario perché `satellite.js` 5.x espone `twoline2satrec` ma non un
 * convertitore JSON ufficiale stabile. Ricostruire le righe è documentato
 * dalla NORAD GP format spec.
 */
export function parseGpRecord(gp: GpRecord): TleSet | null {
  if (gp.TLE_LINE1 && gp.TLE_LINE2) {
    return {
      name: (gp.TLE_LINE0 ?? gp.OBJECT_NAME ?? `NORAD ${gp.NORAD_CAT_ID ?? '?'}`).trim().replace(/^0\s+/, ''),
      line1: gp.TLE_LINE1.trim(),
      line2: gp.TLE_LINE2.trim(),
    };
  }
  if (
    gp.NORAD_CAT_ID === undefined ||
    gp.EPOCH === undefined ||
    gp.MEAN_MOTION === undefined ||
    gp.ECCENTRICITY === undefined ||
    gp.INCLINATION === undefined ||
    gp.RA_OF_ASC_NODE === undefined ||
    gp.ARG_OF_PERICENTER === undefined ||
    gp.MEAN_ANOMALY === undefined
  ) {
    return null;
  }
  const line1 = buildTleLine1(gp);
  const line2 = buildTleLine2(gp);
  if (!line1 || !line2) return null;
  return {
    name: (gp.OBJECT_NAME ?? `NORAD ${gp.NORAD_CAT_ID}`).trim(),
    line1,
    line2,
  };
}

function pad(n: number, len: number, dec = 0): string {
  if (dec > 0) return n.toFixed(dec).padStart(len, ' ');
  return Math.trunc(n).toString().padStart(len, ' ');
}

function buildTleLine1(gp: GpRecord): string | null {
  // Esempio canonico (campi a colonna fissa):
  // 1 25544U 98067A   24268.50000000  .00012345  00000-0  22345-3 0  9991
  const norad = gp.NORAD_CAT_ID!;
  const cls = gp.CLASSIFICATION_TYPE ?? 'U';
  const intl = (gp.OBJECT_ID ?? '').replace(/-/g, '').padEnd(8, ' ').slice(0, 8);
  const epoch = gp.EPOCH ? new Date(gp.EPOCH) : null;
  if (!epoch || Number.isNaN(epoch.getTime())) return null;
  const yy = epoch.getUTCFullYear() % 100;
  const startOfYear = Date.UTC(epoch.getUTCFullYear(), 0, 1);
  const dayOfYear = (epoch.getTime() - startOfYear) / 86400000 + 1;
  const epochStr = `${pad(yy, 2).replace(' ', '0')}${dayOfYear.toFixed(8).padStart(12, '0')}`;
  const mmDot = formatTleDecimalAssumed(gp.MEAN_MOTION_DOT ?? 0); // ".00012345"
  const mmDdot = formatTleExpAssumed(gp.MEAN_MOTION_DDOT ?? 0); // "00000-0"
  const bstar = formatTleExpAssumed(gp.BSTAR ?? 0); // "22345-3"
  const ephem = (gp.EPHEMERIS_TYPE ?? 0).toString();
  const elset = (gp.ELEMENT_SET_NO ?? 999).toString().padStart(4, ' ');
  // costruzione colonna-by-colonna (lo standard ha 69 char + checksum)
  const body =
    `1 ${pad(norad, 5).replace(/ /g, '0')}${cls} ${intl} ${epochStr} ${mmDot} ${mmDdot} ${bstar} ${ephem} ${elset}`.padEnd(
      68,
      ' ',
    );
  return body + computeChecksum(body);
}

function buildTleLine2(gp: GpRecord): string | null {
  const norad = gp.NORAD_CAT_ID!;
  const inc = gp.INCLINATION!.toFixed(4).padStart(8, ' ');
  const raan = gp.RA_OF_ASC_NODE!.toFixed(4).padStart(8, ' ');
  // ECCENTRICITY without leading 0., 7 chars (es: "0.0001234" → "0001234")
  const ecc = (gp.ECCENTRICITY ?? 0).toFixed(7).slice(2).padStart(7, '0');
  const argp = gp.ARG_OF_PERICENTER!.toFixed(4).padStart(8, ' ');
  const m = gp.MEAN_ANOMALY!.toFixed(4).padStart(8, ' ');
  const mm = gp.MEAN_MOTION!.toFixed(8).padStart(11, ' ');
  const rev = (gp.REV_AT_EPOCH ?? 0).toString().padStart(5, ' ');
  const body =
    `2 ${pad(norad, 5).replace(/ /g, '0')} ${inc} ${raan} ${ecc} ${argp} ${m} ${mm}${rev}`.padEnd(
      68,
      ' ',
    );
  return body + computeChecksum(body);
}

function formatTleDecimalAssumed(v: number): string {
  // Es. 0.00012345 → ".00012345" (lunghezza 10)
  const sign = v < 0 ? '-' : ' ';
  const a = Math.abs(v).toFixed(8);
  return `${sign}${a.slice(1)}`.slice(0, 10);
}

function formatTleExpAssumed(v: number): string {
  if (v === 0) return ' 00000-0';
  const sign = v < 0 ? '-' : ' ';
  const abs = Math.abs(v);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = Math.round(abs / Math.pow(10, exp - 4)); // 5-digit mantissa
  const expSign = exp - 1 >= 0 ? '+' : '-';
  return `${sign}${mantissa.toString().padStart(5, '0')}${expSign}${Math.abs(exp - 1)}`;
}

function computeChecksum(line: string): string {
  let sum = 0;
  for (const ch of line) {
    if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48;
    else if (ch === '-') sum += 1;
  }
  return (sum % 10).toString();
}

// --------------------------------- Satrec ---------------------------------

/** Costruisce un satrec a partire da un TleSet. */
export function tleToSatrec(tle: TleSet): Satrec {
  return satellite.twoline2satrec(tle.line1, tle.line2);
}

/** Costruisce un satrec a partire da un GP record CelesTrak (via TLE rebuild). */
export function gpRecordToSatrec(gp: GpRecord): Satrec | null {
  const tle = parseGpRecord(gp);
  if (!tle) return null;
  try {
    const sat = satellite.twoline2satrec(tle.line1, tle.line2);
    if (sat.error && sat.error !== 0) return null;
    return sat;
  } catch {
    return null;
  }
}

// --------------------------------- Propagation ---------------------------------

function geodeticFromSatrec(sat: Satrec, date: Date): PropagatedPosition | null {
  const pv = satellite.propagate(sat, date);
  const pos = pv.position as satellite.EciVec3<number> | boolean | undefined;
  const vel = pv.velocity as satellite.EciVec3<number> | boolean | undefined;
  if (!pos || typeof pos === 'boolean' || !vel || typeof vel === 'boolean') return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(pos, gmst);
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const lat = satellite.degreesLat(geo.latitude);
  const lon = satellite.degreesLong(geo.longitude);
  // Un TLE stale/decaduto può far restituire alla propagazione valori non
  // finiti: NON consegniamo mai coordinate NaN ai consumer (mappa Leaflet).
  // Trattiamo la propagazione degenere come fallimento → null.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    alt: geo.height,
    velocityKms: speed,
    t: date.getTime(),
  };
}

/** Propaga un TLE alla data indicata. Restituisce null se SGP4 fallisce. */
export function propagate(tle: TleSet, date: Date = new Date()): PropagatedPosition | null {
  return geodeticFromSatrec(tleToSatrec(tle), date);
}

/** Propaga un satrec già parsato (preferito in loop frequenti). */
export function propagateSatrec(sat: Satrec, date: Date = new Date()): PropagatedPosition | null {
  return geodeticFromSatrec(sat, date);
}

/**
 * Ground track per un TLE, intervallo [fromMs, toMs] step in secondi.
 * Mantiene la firma legacy di MeteorWatch.
 */
export function groundTrack(
  tle: TleSet,
  fromMs: number,
  toMs: number,
  stepSec = 30,
): PropagatedPosition[] {
  const sat = tleToSatrec(tle);
  return groundTrackSatrec(sat, new Date(fromMs), (toMs - fromMs) / 60_000, stepSec);
}

/**
 * Ground track per un satrec con durata in minuti dal `fromDate`.
 * Firma richiesta dal piano di Fase 2.1.
 */
export function groundTrackSatrec(
  sat: Satrec,
  fromDate: Date = new Date(),
  durationMinutes = 90,
  stepSeconds = 30,
): PropagatedPosition[] {
  const out: PropagatedPosition[] = [];
  const start = fromDate.getTime();
  const end = start + durationMinutes * 60_000;
  const stepMs = stepSeconds * 1000;
  for (let t = start; t <= end; t += stepMs) {
    const p = geodeticFromSatrec(sat, new Date(t));
    if (p) out.push(p);
  }
  return out;
}

// --------------------------------- Orbital elements ---------------------------------

/** Elementi orbitali leggibili per il pannello dettaglio. */
export interface OrbitalElements {
  inclinationDeg: number;
  eccentricity: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionRevPerDay: number;
  periodMinutes: number;
  semiMajorAxisKm: number;
  perigeeKm: number;
  apogeeKm: number;
  epoch: Date;
}

/** Estrae gli elementi orbitali da un satrec già parsato (no GP-JSON necessario). */
export function orbitalElements(sat: Satrec, gp?: GpRecord): OrbitalElements {
  // satellite.js usa unità interne (radianti, rev per minuto) — riconvertiamo.
  const RAD2DEG = 180 / Math.PI;
  const inclinationDeg = sat.inclo * RAD2DEG;
  const eccentricity = sat.ecco;
  const raanDeg = sat.nodeo * RAD2DEG;
  const argPerigeeDeg = sat.argpo * RAD2DEG;
  const meanAnomalyDeg = sat.mo * RAD2DEG;
  // sat.no è rad/min → rev/day = no * (1440 / 2π)
  const meanMotionRevPerDay = (sat.no * 1440) / (2 * Math.PI);
  const periodMinutes = 1440 / Math.max(1e-9, meanMotionRevPerDay);
  const n = sat.no / 60; // rad/sec
  const semiMajorAxisKm = Math.cbrt(MU / (n * n));
  const perigeeKm = semiMajorAxisKm * (1 - eccentricity) - EARTH_R_KM;
  const apogeeKm = semiMajorAxisKm * (1 + eccentricity) - EARTH_R_KM;

  let epoch: Date;
  if (gp?.EPOCH) {
    epoch = new Date(gp.EPOCH);
  } else {
    // Ricostruisce dall'epoch nel satrec (anno/dayOfYear)
    const yy = sat.epochyr;
    const fullYear = yy < 57 ? 2000 + yy : 1900 + yy;
    const start = Date.UTC(fullYear, 0, 1);
    epoch = new Date(start + (sat.epochdays - 1) * 86_400_000);
  }

  return {
    inclinationDeg,
    eccentricity,
    raanDeg,
    argPerigeeDeg,
    meanAnomalyDeg,
    meanMotionRevPerDay,
    periodMinutes,
    semiMajorAxisKm,
    perigeeKm,
    apogeeKm,
    epoch,
  };
}

// --------------------------------- Legacy helpers (porting MeteorWatch) ---------------------------------

export function getMeanMotion(tle: TleSet): number {
  return parseFloat(tle.line2.substring(52, 63));
}

export function getBStar(tle: TleSet): number {
  const raw = tle.line1.substring(53, 61).trim();
  if (!raw) return 0;
  const sign = raw[0] === '-' ? -1 : 1;
  const cleaned = raw.replace(/^[-+]/, '');
  const mantissa = cleaned.slice(0, -2);
  const exp = parseInt(cleaned.slice(-2), 10);
  if (Number.isNaN(exp) || !mantissa) return 0;
  return sign * parseFloat(`0.${mantissa}`) * Math.pow(10, exp);
}

export function getEpoch(tle: TleSet): Date {
  const yy = parseInt(tle.line1.substring(18, 20), 10);
  const dayOfYear = parseFloat(tle.line1.substring(20, 32));
  const fullYear = yy < 57 ? 2000 + yy : 1900 + yy;
  const start = Date.UTC(fullYear, 0, 1);
  return new Date(start + (dayOfYear - 1) * 86400000);
}
