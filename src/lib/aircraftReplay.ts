import type { GatewayAircraft, GatewaySnapshot } from '@/services/aircraftGatewayApi';
import { renderAltitude } from '@/lib/aircraftMotion';

/**
 * Replay differito del traffico aereo.
 *
 * Ogni aereo ha una breve storia di OSSERVAZIONI REALI (istante in cui il
 * provider ha rilevato la posizione, lat/lon, quota). La mappa non mostra
 * "adesso" ma un orologio di replay spostato indietro di circa un intervallo
 * di aggiornamento: a quell'istante l'aereo sta fra due osservazioni reali
 * consecutive A e B, e la sua posizione è ricostruita per interpolazione
 * sul cerchio massimo A→B.
 *
 * Vincoli:
 *  - mai oltre l'ultima osservazione reale: raggiunta B, l'aereo si ferma su
 *    B finché non arriva C;
 *  - nessun uso di velocità o rotta per stimare posizioni;
 *  - con una sola osservazione si mostra quella, ferma.
 */

export interface Observation {
  /** Istante della posizione (ms Unix, orologio del provider). */
  t: number;
  lat: number;
  lon: number;
  /** Quota reale (m) o 0 a terra; null se ignota. */
  altM: number | null;
}

export interface ReplayHistory {
  /** Area interrogata (quantizzata dal gateway) a cui appartiene la storia. */
  area: { lat: number; lon: number; radiusNm: number };
  /** `fetchedAt` dell'ultima fotografia inclusa. */
  lastFetchedAt: number;
  tracks: Map<string, Observation[]>;
}

/** Osservazioni tenute per aereo: bastano A, B (e C in arrivo). */
export const REPLAY_MAX_OBS = 3;
/** Ritardo del replay oltre la freschezza nominale della fotografia. */
export const REPLAY_MARGIN_MS = 5_000;
/**
 * Oltre questo intervallo fra due osservazioni non si interpola (dati
 * discontinui): si resta su A e si passa a B al suo istante.
 */
export const REPLAY_MAX_GAP_MS = 150_000;
/** Velocità implicita oltre la quale A→B è considerato un salto anomalo (m/s). */
export const REPLAY_MAX_SPEED_MS = 400;

/** Ritardo dell'orologio di replay: un intervallo di aggiornamento + margine. */
export function replayDelayMs(ttlS: number): number {
  return ttlS * 1000 + REPLAY_MARGIN_MS;
}

export function observationOf(
  a: GatewayAircraft,
  snapshot: Pick<GatewaySnapshot, 'providerTime' | 'fetchedAt'>,
): Observation {
  const base = snapshot.providerTime ?? snapshot.fetchedAt;
  return {
    t: base - (a.positionAgeS ?? 0) * 1000,
    lat: a.lat,
    lon: a.lon,
    altM: renderAltitude(a).meters,
  };
}

export function sameArea(a: ReplayHistory['area'], b: ReplayHistory['area']): boolean {
  return a.lat === b.lat && a.lon === b.lon && a.radiusNm === b.radiusNm;
}

/**
 * Aggiunge una fotografia reale alla storia. Restano solo gli aerei presenti
 * nella fotografia (uno scomparso non viene più disegnato). Area diversa →
 * storia ripartita da zero. Stessa fotografia due volte → nessun cambiamento.
 *
 * `replayNow` (istante corrente del replay): se il replay ha già superato
 * l'ultima osservazione A (aereo fermo su A in attesa di B), l'ISTANTE di A
 * viene riportato a `replayNow`. La posizione di A resta quella reale: l'aereo
 * riparte da dove è disegnato verso B, senza balzi, e arriva in B all'istante
 * reale di B.
 */
export function ingestSnapshot(
  prev: ReplayHistory | null,
  snapshot: GatewaySnapshot,
  replayNow: number | null = null,
): ReplayHistory {
  const base = prev && sameArea(prev.area, snapshot.area) ? prev : null;
  if (base && base.lastFetchedAt === snapshot.fetchedAt) return base;
  const tracks = new Map<string, Observation[]>();
  for (const a of snapshot.aircraft) {
    const obs = observationOf(a, snapshot);
    let old = base?.tracks.get(a.id) ?? [];
    const last = old[old.length - 1];
    if (last && obs.t > last.t && replayNow !== null && replayNow > last.t && replayNow < obs.t) {
      old = [...old.slice(0, -1), { ...last, t: replayNow }];
    }
    const next = !last || obs.t > last.t ? [...old, obs] : old;
    tracks.set(a.id, next.slice(-REPLAY_MAX_OBS));
  }
  return { area: { ...snapshot.area }, lastFetchedAt: snapshot.fetchedAt, tracks };
}

// ---------------------------------------------------------------------------
// Interpolazione sul cerchio massimo

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function toVec(lat: number, lon: number): [number, number, number] {
  const la = lat * D2R;
  const lo = lon * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Distanza angolare (rad) fra due punti. */
export function angularDistance(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const [x1, y1, z1] = toVec(a.lat, a.lon);
  const [x2, y2, z2] = toVec(b.lat, b.lon);
  const dot = Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2));
  return Math.acos(dot);
}

/** Punto a frazione f ∈ [0,1] del cerchio massimo da a a b (slerp). */
export function greatCircleAt(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  f: number,
): { lat: number; lon: number } {
  const omega = angularDistance(a, b);
  if (omega < 1e-12) return { lat: a.lat, lon: a.lon };
  const va = toVec(a.lat, a.lon);
  const vb = toVec(b.lat, b.lon);
  const s = Math.sin(omega);
  const ka = Math.sin((1 - f) * omega) / s;
  const kb = Math.sin(f * omega) / s;
  const x = ka * va[0] + kb * vb[0];
  const y = ka * va[1] + kb * vb[1];
  const z = ka * va[2] + kb * vb[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) * R2D, lon: Math.atan2(y, x) * R2D };
}

export type ReplayPhase = 'interpolated' | 'holding-first' | 'holding-last' | 'step';

export interface ReplayPoint {
  lat: number;
  lon: number;
  altM: number | null;
  phase: ReplayPhase;
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Posizione da disegnare all'istante di replay `t` (orologio del provider).
 * Mai oltre l'ultima osservazione: da lì in poi restituisce esattamente quella.
 */
export function replayPosition(obs: readonly Observation[], t: number): ReplayPoint | null {
  if (obs.length === 0) return null;
  const first = obs[0] as Observation;
  const last = obs[obs.length - 1] as Observation;
  if (t >= last.t) return { lat: last.lat, lon: last.lon, altM: last.altM, phase: 'holding-last' };
  if (t <= first.t)
    return { lat: first.lat, lon: first.lon, altM: first.altM, phase: 'holding-first' };
  for (let i = 0; i < obs.length - 1; i++) {
    const a = obs[i] as Observation;
    const b = obs[i + 1] as Observation;
    if (t < a.t || t >= b.t) continue;
    const dt = b.t - a.t;
    const meters = angularDistance(a, b) * EARTH_RADIUS_M;
    if (dt > REPLAY_MAX_GAP_MS || meters / (dt / 1000) > REPLAY_MAX_SPEED_MS) {
      // Dati discontinui: nessun movimento ricostruito, resta su A fino a B.
      return { lat: a.lat, lon: a.lon, altM: a.altM, phase: 'step' };
    }
    const f = (t - a.t) / dt;
    const p = greatCircleAt(a, b, f);
    const altM =
      a.altM !== null && b.altM !== null
        ? a.altM + (b.altM - a.altM) * f
        : f < 0.5
          ? a.altM
          : b.altM;
    return { lat: p.lat, lon: p.lon, altM, phase: 'interpolated' };
  }
  return { lat: last.lat, lon: last.lon, altM: last.altM, phase: 'holding-last' };
}
