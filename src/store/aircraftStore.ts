import { create } from 'zustand';
import type { GatewayAircraft, GatewaySnapshot } from '@/services/aircraftGatewayApi';
import { replayDelayMs, type ReplayHistory } from '@/lib/aircraftReplay';

/**
 * Stato UNICO del traffico aereo per tutta l'app. Lo scrive soltanto
 * `aircraftPoller`; i componenti lo leggono e basta. Non persistito: solo la
 * storia del replay sopravvive a un reload, in sessionStorage (vedi
 * `aircraftReplayStorage.ts`).
 */
export interface AircraftFeedState {
  snapshot: GatewaySnapshot | null;
  /** Ultima risposta = fotografia stale autorizzata dal gateway. */
  gatewayStale: boolean;
  status: 'off' | 'loading' | 'ok' | 'error';
  error: string | null;
  /** Richieste inviate al gateway da questa sessione (diagnostica). */
  requests: number;
  /** Istante di ricezione dell'ultima fotografia (orologio del browser). */
  receivedAt: number | null;
  /** Età della fotografia alla ricezione (header `Age` del gateway), ms. */
  ageAtReceiptMs: number | null;
  /** Osservazioni reali per il replay differito. */
  history: ReplayHistory | null;
}

export const initialAircraftFeedState: AircraftFeedState = {
  snapshot: null,
  gatewayStale: false,
  status: 'off',
  error: null,
  requests: 0,
  receivedAt: null,
  ageAtReceiptMs: null,
  history: null,
};

export const useAircraftStore = create<AircraftFeedState>(() => ({ ...initialAircraftFeedState }));

/** Oltre questa età (freschezza 30 s + stale 120 s del gateway) i dati non si mostrano più. */
export const AIRCRAFT_MAX_DISPLAY_AGE_MS = 150_000;
/** Tolleranza oltre la freschezza nominale entro cui la fotografia è ancora LIVE. */
export const AIRCRAFT_LIVE_MARGIN_MS = 5_000;

/** Array vuoto stabile: evita nuove identità (e re-render a catena) quando non c'è nulla da mostrare. */
const NO_AIRCRAFT: GatewayAircraft[] = [];

/**
 * Età della fotografia adesso: età alla ricezione (misurata dal gateway) più
 * il tempo trascorso da allora sull'orologio del browser. Nessun confronto
 * fra orologi diversi.
 */
export function snapshotAgeMs(state: AircraftFeedState, now: number): number | null {
  const { snapshot } = state;
  if (!snapshot) return null;
  if (state.receivedAt === null) return Math.max(0, now - snapshot.fetchedAt);
  const atReceipt = state.ageAtReceiptMs ?? Math.max(0, state.receivedAt - snapshot.fetchedAt);
  return Math.max(0, atReceipt + (now - state.receivedAt));
}

/** Stima dell'istante attuale sull'orologio del gateway/provider (ms Unix). */
export function serverNowMs(state: AircraftFeedState, now: number): number | null {
  const age = snapshotAgeMs(state, now);
  return state.snapshot && age !== null ? state.snapshot.fetchedAt + age : null;
}

/** Istante mostrato dal replay differito (orologio del provider). */
export function replayTimeMs(state: AircraftFeedState, now: number): number | null {
  const server = serverNowMs(state, now);
  return server === null || !state.snapshot ? null : server - replayDelayMs(state.snapshot.ttlS);
}

/** Secondi trascorsi da quando il provider ha rilevato la posizione di questo aereo. */
export function positionAgeNowS(
  a: GatewayAircraft,
  state: AircraftFeedState,
  now: number,
): number | null {
  const server = serverNowMs(state, now);
  const snap = state.snapshot;
  if (server === null || !snap || a.positionAgeS === null) return null;
  const observedAt = (snap.providerTime ?? snap.fetchedAt) - a.positionAgeS * 1000;
  return Math.max(0, (server - observedAt) / 1000);
}

export type AircraftFreshness = 'off' | 'loading' | 'live' | 'delayed' | 'unavailable';

export interface AircraftView {
  freshness: AircraftFreshness;
  aircraft: GatewayAircraft[];
  snapshot: GatewaySnapshot | null;
  /** Età della FOTOGRAFIA in ms (non della singola posizione), null se nessun dato. */
  ageMs: number | null;
  history: ReplayHistory | null;
}

/**
 * Cosa mostrare adesso:
 *  - LIVE: risposta riuscita, non stale per il gateway, fotografia ≤ ttlS + 5 s;
 *  - delayed ("ritardo N s"): fotografia più vecchia ma entro 150 s;
 *  - unavailable: oltre 150 s o nessun dato. Niente fallback.
 */
export function aircraftView(state: AircraftFeedState, now: number): AircraftView {
  const { snapshot } = state;
  const empty = { aircraft: NO_AIRCRAFT, history: null };
  if (state.status === 'off') return { freshness: 'off', snapshot: null, ageMs: null, ...empty };
  if (!snapshot) {
    return {
      freshness: state.status === 'error' ? 'unavailable' : 'loading',
      snapshot: null,
      ageMs: null,
      ...empty,
    };
  }
  const ageMs = snapshotAgeMs(state, now) ?? 0;
  if (ageMs > AIRCRAFT_MAX_DISPLAY_AGE_MS) {
    return { freshness: 'unavailable', snapshot, ageMs, ...empty };
  }
  const live =
    state.status === 'ok' &&
    !state.gatewayStale &&
    ageMs <= snapshot.ttlS * 1000 + AIRCRAFT_LIVE_MARGIN_MS;
  return {
    freshness: live ? 'live' : 'delayed',
    aircraft: snapshot.aircraft,
    snapshot,
    ageMs,
    history: state.history,
  };
}
