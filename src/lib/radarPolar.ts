/**
 * Helper puri per il "Radar Mode" tributo: proiezione di coordinate
 * geografiche in coordinate polari (range/bearing) relative a un centro,
 * filtraggio per raggio e mapping in pixel canvas.
 *
 * L'estetica vintage del progetto originale (canvas verde fosforo) usa
 * un sistema PPI (Plan Position Indicator): bearing 0° = Nord (alto),
 * crescita oraria (90° = Est, 180° = Sud, 270° = Ovest).
 */
import { bearingDeg, haversineKm } from '@/utils/geo';

export interface PolarPoint {
  /** Distanza great-circle in km dal centro radar. */
  rangeKm: number;
  /** Bearing iniziale in gradi (0 = Nord, 90 = Est). */
  bearingDeg: number;
  /** Distanza normalizzata 0..1 rispetto al raggio max del radar. */
  rangeNorm: number;
  /** True se il punto è entro il raggio del radar. */
  inRange: boolean;
}

export interface RadarRange {
  id: '100' | '500' | '1000' | '5000';
  km: number;
  /** Step delle ring concentriche in km. 4 ring per coerenza visiva. */
  ringStepKm: number;
}

export const RADAR_RANGES: RadarRange[] = [
  { id: '100', km: 100, ringStepKm: 25 },
  { id: '500', km: 500, ringStepKm: 125 },
  { id: '1000', km: 1000, ringStepKm: 250 },
  { id: '5000', km: 5000, ringStepKm: 1250 },
];

/**
 * Proietta un punto geografico in coordinate polari relative al centro radar.
 * `rangeNorm` è clampato a 0 quando inRange è true (nessuna divisione safe-guard
 * extra: caller passa sempre radiusKm > 0).
 */
export function toPolar(
  centerLat: number,
  centerLon: number,
  pointLat: number,
  pointLon: number,
  radiusKm: number,
): PolarPoint {
  const r = haversineKm(centerLat, centerLon, pointLat, pointLon);
  const b = bearingDeg(centerLat, centerLon, pointLat, pointLon);
  return {
    rangeKm: r,
    bearingDeg: b,
    rangeNorm: radiusKm > 0 ? r / radiusKm : 0,
    inRange: r <= radiusKm,
  };
}

/**
 * Proietta (bearing, rangeNorm) in pixel canvas rispetto al centro (cx, cy)
 * con raggio in pixel R. Mantiene la convenzione PPI (0° = top, oraria).
 */
export function polarToCanvas(
  bearingDeg: number,
  rangeNorm: number,
  cx: number,
  cy: number,
  R: number,
): { x: number; y: number } {
  // Canvas: 0° (N) deve puntare verso l'alto (-Y). Conversione standard:
  // angle = bearing - 90, in radianti, poi cos/sin.
  const angle = ((bearingDeg - 90) * Math.PI) / 180;
  const r = clamp01(rangeNorm) * R;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

/** Clamp [0, 1]. NaN → 0. */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Normalizza un angolo arbitrario nel range [0, 360). */
export function normalizeAngle(a: number): number {
  const n = a % 360;
  return n < 0 ? n + 360 : n;
}

/**
 * Decide se la sweep ha attraversato il bearing del target nell'ultimo step.
 * Lo sweep si muove in senso orario: prev → cur (entrambi normalizzati).
 * Gestisce il wrap 359° → 0° trattando l'arco come `prev` < `cur` modulo 360.
 *
 * Usato per triggerare il "ping" audio quando la lancia passa sul target.
 */
export function isSwept(targetDeg: number, prevSweepDeg: number, curSweepDeg: number): boolean {
  const target = normalizeAngle(targetDeg);
  const prev = normalizeAngle(prevSweepDeg);
  const cur = normalizeAngle(curSweepDeg);
  if (prev === cur) return false;
  if (cur > prev) {
    return target > prev && target <= cur;
  }
  // wrap: l'arco prev→cur passa dallo zero
  return target > prev || target <= cur;
}

/** Filtra i punti dentro il raggio radar e li mappa già in PolarPoint. */
export function filterInRange<T>(
  items: T[],
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  getLatLon: (item: T) => { lat: number; lon: number },
): Array<T & { polar: PolarPoint }> {
  const out: Array<T & { polar: PolarPoint }> = [];
  for (const it of items) {
    const { lat, lon } = getLatLon(it);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const polar = toPolar(centerLat, centerLon, lat, lon, radiusKm);
    if (polar.inRange) out.push({ ...it, polar });
  }
  return out;
}
