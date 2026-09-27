import { create } from 'zustand';
import type { GatewayAircraft, GatewaySnapshot } from '@/services/aircraftGatewayApi';

/**
 * Stato UNICO del traffico aereo per tutta l'app (non persistito: posizioni
 * vecchie non devono sopravvivere a un reload). Lo scrive soltanto
 * `aircraftPoller`; i componenti lo leggono e basta.
 */
export interface AircraftFeedState {
  snapshot: GatewaySnapshot | null;
  /** Ultima risposta = fotografia stale autorizzata dal gateway. */
  gatewayStale: boolean;
  status: 'off' | 'loading' | 'ok' | 'error';
  error: string | null;
  /** Richieste inviate al gateway da questa sessione (diagnostica). */
  requests: number;
}

export const initialAircraftFeedState: AircraftFeedState = {
  snapshot: null,
  gatewayStale: false,
  status: 'off',
  error: null,
  requests: 0,
};

export const useAircraftStore = create<AircraftFeedState>(() => ({ ...initialAircraftFeedState }));

/** Oltre questa età (freschezza 30 s + stale 120 s del gateway) i dati non si mostrano più. */
export const AIRCRAFT_MAX_DISPLAY_AGE_MS = 150_000;

/** Array vuoto stabile: evita nuove identità (e re-render a catena) quando non c'è nulla da mostrare. */
const NO_AIRCRAFT: GatewayAircraft[] = [];

export type AircraftFreshness = 'off' | 'loading' | 'live' | 'stale' | 'unavailable';

export interface AircraftView {
  freshness: AircraftFreshness;
  aircraft: GatewayAircraft[];
  snapshot: GatewaySnapshot | null;
  /** Età dei dati in ms (da `fetchedAt`), null se nessun dato. */
  ageMs: number | null;
}

/**
 * Cosa mostrare adesso. LIVE solo se l'ultima risposta è andata a buon fine,
 * non è stale per il gateway ed è entro due cicli di freschezza. Oltre
 * `AIRCRAFT_MAX_DISPLAY_AGE_MS` nessun aereo: niente dati vecchi spacciati
 * per attuali, niente fallback.
 */
export function aircraftView(state: AircraftFeedState, now: number): AircraftView {
  const { snapshot } = state;
  if (state.status === 'off')
    return { freshness: 'off', aircraft: NO_AIRCRAFT, snapshot: null, ageMs: null };
  if (!snapshot) {
    return {
      freshness: state.status === 'error' ? 'unavailable' : 'loading',
      aircraft: NO_AIRCRAFT,
      snapshot: null,
      ageMs: null,
    };
  }
  const ageMs = Math.max(0, now - snapshot.fetchedAt);
  if (ageMs > AIRCRAFT_MAX_DISPLAY_AGE_MS) {
    return { freshness: 'unavailable', aircraft: NO_AIRCRAFT, snapshot, ageMs };
  }
  const live =
    state.status === 'ok' && !state.gatewayStale && ageMs <= snapshot.ttlS * 2000 + 10_000;
  return { freshness: live ? 'live' : 'stale', aircraft: snapshot.aircraft, snapshot, ageMs };
}
