/**
 * Pass predictor per satelliti LEO (ISS in primis).
 *
 * Algoritmo:
 *  1. Propaga SGP4 a step `stepSec` (default 60s) sulla finestra richiesta.
 *  2. Per ogni step calcola elevation/azimuth del satellite dal punto osservatore
 *     (formula sferica con Terra approssimata sferica raggio 6371 km).
 *  3. Identifica le finestre contigue con elevation > 0° (passaggi).
 *  4. Filtra le finestre con max elevation >= `minMaxElevDeg` (default 10°).
 *  5. Per ogni passaggio calcola flag `visible`:
 *       - sole sotto orizzonte osservatore (alt sole ≤ −6°: crepuscolo civile)
 *       - satellite illuminato dal sole (non in ombra Terra)
 *  6. Stima `magnitude` apparente con un modello semplice basato sulla quota
 *     osservata (più alto = più vicino = più luminoso) e sull'angolo di fase.
 *
 * NOTA: per uragani / oggetti di altra natura non ha senso. Funziona per LEO con
 * altitudine 350–500 km dove l'ombra terrestre lascia ~45 min di luce ai
 * crepuscoli locali — la finestra in cui l'ISS è famosa per essere visibile.
 */
import { propagateSatrec, type Satrec } from '@/lib/sgp4Lite';

const EARTH_R_KM = 6371;
const SUN_DEG = Math.PI / 180;

export interface ObserverLocation {
  /** Latitudine in gradi. */
  lat: number;
  /** Longitudine in gradi. */
  lon: number;
  /** Quota osservatore (metri). Default 0. */
  altM?: number;
}

export interface PassPoint {
  t: number;
  elevationDeg: number;
  azimuthDeg: number;
  /** Quota satellite in km al timestamp `t`. */
  satAltKm: number;
  /** Distanza slant osservatore↔satellite in km. */
  rangeKm: number;
  /** True se il satellite è illuminato dal sole (no ombra Terra). */
  satSunlit: boolean;
  /** Altitude solare al punto osservatore (gradi, < 0 = sotto orizzonte). */
  sunAltDeg: number;
}

export interface Pass {
  /** Timestamp inizio (elevation crossing 0° dal basso). */
  start: number;
  /** Timestamp fine (elevation crossing 0° dall'alto). */
  end: number;
  /** Elevation massima nel passaggio. */
  maxElevationDeg: number;
  /** Azimuth al momento di max elevation. */
  maxElevationAzimuthDeg: number;
  /** Durata in secondi. */
  durationSec: number;
  /** True se *tutto il passaggio* contiene almeno uno step con visibility positiva. */
  visible: boolean;
  /** Magnitudine apparente stimata al picco (più negativo = più luminoso). */
  magnitude: number | null;
  /** Sample massimo (utile per debug + UI). */
  peak: PassPoint;
}

export interface PredictPassesOpts {
  satrec: Satrec;
  observer: ObserverLocation;
  /** Timestamp di partenza (default Date.now()). */
  fromMs?: number;
  /** Durata finestra in ore (default 48). */
  windowHours?: number;
  /** Step di propagazione in secondi (default 60). */
  stepSec?: number;
  /** Soglia di max elevation per considerare un passaggio (default 10°). */
  minMaxElevDeg?: number;
  /** Soglia altitudine solare per "notte all'osservatore" (default -6°, civile). */
  sunBelowDeg?: number;
}

// ----------------------------------------------------------------------------
// Geometria osservatore
// ----------------------------------------------------------------------------

/**
 * Elevation e azimuth di un punto satellite (lat/lon/alt) visto da un punto
 * osservatore (lat/lon/alt) in gradi, su sfera approssimata.
 *
 * Esposto pubblicamente per testabilità.
 */
export function elevationAzimuth(
  observerLat: number,
  observerLon: number,
  observerAltKm: number,
  satLat: number,
  satLon: number,
  satAltKm: number,
): { elevationDeg: number; azimuthDeg: number; rangeKm: number } {
  // Vettori ECEF approssimati (Terra sferica). È sufficiente per finestre di
  // visibilità ISS dove l'errore introdotto da geoid è << 1° in elevation.
  const obs = ecef(observerLat, observerLon, observerAltKm);
  const sat = ecef(satLat, satLon, satAltKm);
  const dx = sat.x - obs.x;
  const dy = sat.y - obs.y;
  const dz = sat.z - obs.z;
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Trasformazione ENU (East, North, Up) centrata sull'osservatore.
  const lat = observerLat * SUN_DEG;
  const lon = observerLon * SUN_DEG;
  const sLat = Math.sin(lat);
  const cLat = Math.cos(lat);
  const sLon = Math.sin(lon);
  const cLon = Math.cos(lon);
  const east = -sLon * dx + cLon * dy;
  const north = -sLat * cLon * dx - sLat * sLon * dy + cLat * dz;
  const up = cLat * cLon * dx + cLat * sLon * dy + sLat * dz;

  const elevationRad = Math.atan2(up, Math.sqrt(east * east + north * north));
  const azimuthRad = Math.atan2(east, north);
  let azimuthDeg = (azimuthRad * 180) / Math.PI;
  if (azimuthDeg < 0) azimuthDeg += 360;

  return {
    elevationDeg: (elevationRad * 180) / Math.PI,
    azimuthDeg,
    rangeKm: range,
  };
}

function ecef(latDeg: number, lonDeg: number, altKm: number) {
  const lat = latDeg * SUN_DEG;
  const lon = lonDeg * SUN_DEG;
  const r = EARTH_R_KM + altKm;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

// ----------------------------------------------------------------------------
// Sole
// ----------------------------------------------------------------------------

/**
 * Posizione subsolare approssimata (lat, lon in gradi) e azimuth/altitude
 * solari per un osservatore. Modello low-fidelity: declinazione e GHA del sole
 * via NOAA approximation. Tolleranza ~0.5° (più che sufficiente per filtrare
 * "sole sopra/sotto orizzonte" e "satellite in ombra Terra").
 */
export function sunSubpoint(date: Date): { lat: number; lon: number } {
  const t = date.getTime();
  const jd = t / 86_400_000 + 2440587.5;
  const n = jd - 2451545;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * SUN_DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * SUN_DEG;
  const eps = 23.439 * SUN_DEG;
  const declRad = Math.asin(Math.sin(eps) * Math.sin(lambda));

  // GMST → Greenwich Hour Angle of vernal equinox.
  // Subsolar lon = -GHA_sun + lambda_app projection through equation of time.
  // Per la nostra approssimazione, basta stimare il subsolar lon dal tempo UTC.
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  // Il sole è sopra il meridiano 0° UTC ~ alle 12:00 UTC. Subsolar lon ≈ (12 - UTC) * 15°.
  // Equation of time stimata in modo grezzo (max ±16 min ≈ ±4°).
  const eqTimeMin =
    9.87 * Math.sin(2 * (g + 0.05236)) - 7.53 * Math.cos(g) - 1.5 * Math.sin(g);
  const subsolarLon = (12 - utcHours - eqTimeMin / 60) * 15;
  const lonNorm = ((subsolarLon + 540) % 360) - 180;
  return { lat: (declRad * 180) / Math.PI, lon: lonNorm };
}

/** Altitudine solare in gradi al punto osservatore (per il flag "notte"). */
export function sunAltitudeDeg(date: Date, observer: ObserverLocation): number {
  const sub = sunSubpoint(date);
  // Sole è "molto distante" → trattalo come direzione, non come punto.
  // Otteniamo elevation con la stessa formula ENU usando un satellite a 1 AU.
  const ASTRONOMICAL_UNIT_KM = 149_597_870;
  const r = elevationAzimuth(
    observer.lat,
    observer.lon,
    (observer.altM ?? 0) / 1000,
    sub.lat,
    sub.lon,
    ASTRONOMICAL_UNIT_KM,
  );
  return r.elevationDeg;
}

/**
 * True se un satellite a (lat, lon, alt) è ILLUMINATO dal sole (non nell'ombra
 * della Terra). Usa una geometria sferica: il satellite è in ombra se l'angolo
 * fra il vettore Sole→Terra e il vettore Sole→Satellite è < arcsin(R⊕ / r_sat).
 * Approx low-fidelity ma sufficiente per il filtro visibilità.
 */
export function isSatSunlit(date: Date, satLat: number, satLon: number, satAltKm: number): boolean {
  const sub = sunSubpoint(date);
  // Sole come direzione unitaria (verso Terra) usando lat/lon subsolari.
  const sx = Math.cos(sub.lat * SUN_DEG) * Math.cos(sub.lon * SUN_DEG);
  const sy = Math.cos(sub.lat * SUN_DEG) * Math.sin(sub.lon * SUN_DEG);
  const sz = Math.sin(sub.lat * SUN_DEG);
  const sat = ecef(satLat, satLon, satAltKm);
  const r = Math.sqrt(sat.x * sat.x + sat.y * sat.y + sat.z * sat.z);
  // Componente del vettore satellite proiettata sul vettore-Sole.
  const proj = (sat.x * sx + sat.y * sy + sat.z * sz) / r;
  // Se il satellite è dietro la Terra (proj < 0) e la sua componente trasversa
  // è inferiore al raggio terrestre, è in ombra.
  if (proj >= 0) return true;
  const transverse = Math.sqrt(r * r - (sat.x * sx + sat.y * sy + sat.z * sz) ** 2);
  return transverse > EARTH_R_KM;
}

// ----------------------------------------------------------------------------
// Magnitudine
// ----------------------------------------------------------------------------

/**
 * Stima magnitudine apparente di un satellite LEO al picco di un passaggio.
 * Modello molto semplice (precisione ±0.5):
 *
 *    mag = mag_ref + 5 log10(range / range_ref) − 2.5 log10(phase_factor)
 *
 * con valori di riferimento ISS (mag −1.3 a 1000 km, fase 50%).
 */
export function estimateMagnitude(rangeKm: number, elevationDeg: number): number {
  const REF_RANGE = 1000;
  const REF_MAG = -1.3;
  const distMag = REF_MAG + 5 * Math.log10(rangeKm / REF_RANGE);
  // Fase semplice: più alto in cielo → più "fronte alla luce".
  // Modelliamo phase_factor = sin(elevation), 0..1.
  const phase = Math.max(0.05, Math.sin(elevationDeg * SUN_DEG));
  return distMag - 2.5 * Math.log10(phase);
}

// ----------------------------------------------------------------------------
// Predizione passaggi
// ----------------------------------------------------------------------------

export function predictPasses(opts: PredictPassesOpts): Pass[] {
  const fromMs = opts.fromMs ?? Date.now();
  const windowHours = opts.windowHours ?? 48;
  const stepSec = opts.stepSec ?? 60;
  const minMaxElev = opts.minMaxElevDeg ?? 10;
  const sunBelow = opts.sunBelowDeg ?? -6;
  const endMs = fromMs + windowHours * 3_600_000;
  const stepMs = stepSec * 1000;

  const passes: Pass[] = [];
  let active: PassPoint[] | null = null;

  for (let t = fromMs; t <= endMs; t += stepMs) {
    const date = new Date(t);
    const sat = propagateSatrec(opts.satrec, date);
    if (!sat) continue;
    const obs = opts.observer;
    const { elevationDeg, azimuthDeg, rangeKm } = elevationAzimuth(
      obs.lat,
      obs.lon,
      (obs.altM ?? 0) / 1000,
      sat.lat,
      sat.lon,
      sat.alt,
    );
    if (elevationDeg <= 0) {
      if (active && active.length > 0) {
        const finalized = finalizePass(active, minMaxElev, sunBelow);
        if (finalized) passes.push(finalized);
      }
      active = null;
      continue;
    }
    const sample: PassPoint = {
      t,
      elevationDeg,
      azimuthDeg,
      satAltKm: sat.alt,
      rangeKm,
      satSunlit: isSatSunlit(date, sat.lat, sat.lon, sat.alt),
      sunAltDeg: sunAltitudeDeg(date, obs),
    };
    if (!active) active = [sample];
    else active.push(sample);
  }
  if (active && active.length > 0) {
    const finalized = finalizePass(active, minMaxElev, sunBelow);
    if (finalized) passes.push(finalized);
  }
  return passes;
}

function finalizePass(samples: PassPoint[], minMaxElev: number, sunBelow: number): Pass | null {
  let peak = samples[0];
  for (const s of samples) {
    if (s.elevationDeg > peak.elevationDeg) peak = s;
  }
  if (peak.elevationDeg < minMaxElev) return null;
  const visible = samples.some((s) => s.satSunlit && s.sunAltDeg <= sunBelow);
  return {
    start: samples[0].t,
    end: samples[samples.length - 1].t,
    maxElevationDeg: peak.elevationDeg,
    maxElevationAzimuthDeg: peak.azimuthDeg,
    durationSec: (samples[samples.length - 1].t - samples[0].t) / 1000,
    visible,
    magnitude: visible ? estimateMagnitude(peak.rangeKm, peak.elevationDeg) : null,
    peak,
  };
}

// ----------------------------------------------------------------------------
// Helpers presentazionali
// ----------------------------------------------------------------------------

/** Direzione cardinale a partire da un azimuth in gradi. */
export function azimuthToCardinal(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round(azDeg / 45) % 8;
  return dirs[i];
}
