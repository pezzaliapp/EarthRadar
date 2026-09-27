import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Regole di visualizzazione degli aerei, pure e testabili.
 *
 * Mai inventare: quota o direzione assenti restano assenti. Il movimento è
 * SOLO una transizione grafica fra due posizioni reali già ricevute (A → B):
 * si ferma esattamente su B, non prosegue oltre e non usa velocità o rotta
 * per stimare posizioni future.
 */

export type AltitudeKind = 'measured' | 'ground' | 'unknown';

export interface RenderAltitude {
  kind: AltitudeKind;
  /** Metri reali; 0 a terra; null se la quota non è nota (mai un valore di ripiego). */
  meters: number | null;
}

export function renderAltitude(a: GatewayAircraft): RenderAltitude {
  if (a.onGround) return { kind: 'ground', meters: 0 };
  const m = a.altBaroM ?? a.altGeomM;
  return m === null ? { kind: 'unknown', meters: null } : { kind: 'measured', meters: m };
}

/** Rotta reale in gradi, oppure null: simbolo neutro, nessuna direzione inventata. */
export function renderHeadingDeg(a: GatewayAircraft): number | null {
  return a.trackDeg;
}

export interface MotionPoint {
  lat: number;
  lon: number;
  /** Metri reali, o null se ignoti. */
  altM: number | null;
}

export interface MotionTrack {
  from: MotionPoint;
  to: MotionPoint;
  startMs: number;
  durationMs: number;
}

/** Durata della transizione grafica A → B. */
export const AIRCRAFT_TRANSITION_MS = 1_500;
/** Oltre questa distanza nessuna transizione (cambio area, dati discontinui): salto diretto a B. */
export const AIRCRAFT_TRANSITION_MAX_KM = 30;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Differenza di longitudine sul percorso più breve (antimeridiano). */
function lonDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Posizione mostrata all'istante `now`: fra A e B, e da fine transizione esattamente B. */
export function positionAt(track: MotionTrack, now: number): MotionPoint {
  const t =
    track.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (now - track.startMs) / track.durationMs));
  if (t >= 1) return track.to;
  const { from, to } = track;
  return {
    lat: lerp(from.lat, to.lat, t),
    lon: wrapLon(from.lon + lonDelta(from.lon, to.lon) * t),
    // Quota interpolata solo se entrambe reali; altrimenti quella (reale o nulla) di B.
    altM: from.altM !== null && to.altM !== null ? lerp(from.altM, to.altM, t) : to.altM,
  };
}

export function isTransitionDone(track: MotionTrack, now: number): boolean {
  return track.durationMs <= 0 || now >= track.startMs + track.durationMs;
}

function roughKm(a: MotionPoint, b: MotionPoint): number {
  const dLat = (b.lat - a.lat) * 111.32;
  const dLon = lonDelta(a.lon, b.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}

/**
 * Nuova posizione reale B ricevuta: la transizione riparte da dove l'aereo è
 * mostrato ORA (anche a metà di una transizione precedente) verso B.
 * Prima apparizione, salto troppo lungo o movimento ridotto → subito B.
 */
export function retarget(
  previous: MotionTrack | undefined,
  to: MotionPoint,
  now: number,
  durationMs: number = AIRCRAFT_TRANSITION_MS,
): MotionTrack {
  if (!previous || durationMs <= 0) return { from: to, to, startMs: now, durationMs: 0 };
  const from = positionAt(previous, now);
  if (roughKm(from, to) > AIRCRAFT_TRANSITION_MAX_KM) {
    return { from: to, to, startMs: now, durationMs: 0 };
  }
  return { from, to, startMs: now, durationMs };
}
