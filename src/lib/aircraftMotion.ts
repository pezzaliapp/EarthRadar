import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Regole di visualizzazione degli aerei, pure e testabili.
 *
 * Mai inventare: quota o direzione assenti restano assenti. Il movimento
 * (replay differito fra due osservazioni reali) è in `aircraftReplay.ts`.
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
