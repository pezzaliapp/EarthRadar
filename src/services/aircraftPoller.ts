import { haversineKm } from '@/utils/geo';
import {
  AIRCRAFT_MAX_RADIUS_NM,
  fetchAircraftArea,
  type GatewayResult,
} from '@/services/aircraftGatewayApi';
import {
  initialAircraftFeedState,
  useAircraftStore,
  type AircraftFeedState,
} from '@/store/aircraftStore';

/**
 * Poller UNICO del traffico aereo (singleton per l'app).
 *
 * - I componenti dichiarano una "domanda" (`setDemand`): layer attivo e centro
 *   dell'area osservata. Il poller fa al massimo UNA richiesta alla volta,
 *   per tutti.
 * - Nessuna domanda attiva (layer spento) → nessuna richiesta, dati azzerati.
 * - Pagina nascosta → nessuna richiesta; al ritorno visibile si aggiorna
 *   subito solo se l'intervallo di 30 s è già scaduto.
 * - Poll ogni 30 s. Spostamento del centro oltre 20 NM → nuova richiesta,
 *   ma mai prima di 5 s dalla precedente.
 * - Errori e `Retry-After`: la richiesta successiva non parte prima di
 *   max(Retry-After, 30 s). Nessun retry immediato.
 */

export const AIRCRAFT_POLL_MS = 30_000;
export const AIRCRAFT_MIN_GAP_MS = 5_000;
export const AIRCRAFT_RECENTER_NM = 20;
/** Sempre il massimo consentito dal gateway: un'area = una richiesta. */
export const AIRCRAFT_REQUEST_RADIUS_NM = AIRCRAFT_MAX_RADIUS_NM;

export interface AircraftCenter {
  lat: number;
  lon: number;
}

export interface AircraftDemand {
  enabled: boolean;
  center: AircraftCenter;
}

export interface AircraftPollerDeps {
  fetchArea: (
    area: { lat: number; lon: number; radiusNm: number },
    signal: AbortSignal,
  ) => Promise<GatewayResult>;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  isHidden: () => boolean;
  subscribeVisibility: (cb: () => void) => () => void;
  getState: () => AircraftFeedState;
  setState: (partial: Partial<AircraftFeedState>) => void;
}

const KM_PER_NM = 1.852;

export class AircraftPoller {
  private readonly deps: AircraftPollerDeps;
  private readonly demands = new Map<string, AircraftDemand & { seq: number }>();
  private seq = 0;
  private timer: unknown = null;
  private inflight: AbortController | null = null;
  private generation = 0;
  private lastRequestAt: number | null = null;
  private lastCenter: AircraftCenter | null = null;
  private retryAfterUntil: number | null = null;
  private wasEnabled = false;
  private readonly unsubscribe: () => void;

  constructor(deps: AircraftPollerDeps) {
    this.deps = deps;
    this.unsubscribe = deps.subscribeVisibility(() => this.schedule());
  }

  /** `demand = null` ritira la domanda (componente smontato). */
  setDemand(id: string, demand: AircraftDemand | null): void {
    if (demand) this.demands.set(id, { ...demand, seq: ++this.seq });
    else this.demands.delete(id);
    this.schedule();
  }

  dispose(): void {
    this.demands.clear();
    this.schedule();
    this.unsubscribe();
  }

  /** Centro della domanda attiva più recente; null se nessuna è attiva. */
  private activeCenter(): AircraftCenter | null {
    let best: (AircraftDemand & { seq: number }) | null = null;
    for (const d of this.demands.values()) {
      if (d.enabled && (!best || d.seq > best.seq)) best = d;
    }
    return best ? best.center : null;
  }

  private stop(): void {
    this.generation += 1;
    this.inflight?.abort();
    this.inflight = null;
    if (this.wasEnabled) {
      // Layer spento: via i dati, niente posizioni vecchie alla riaccensione.
      this.deps.setState({ ...initialAircraftFeedState, requests: this.deps.getState().requests });
      this.wasEnabled = false;
    }
  }

  private schedule(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
    const center = this.activeCenter();
    if (!center) {
      this.stop();
      return;
    }
    if (!this.wasEnabled) {
      this.wasEnabled = true;
      if (this.deps.getState().status === 'off') this.deps.setState({ status: 'loading' });
    }
    if (this.deps.isHidden() || this.inflight) return;

    const now = this.deps.now();
    let due: number;
    if (this.lastRequestAt === null) due = now;
    else if (this.movedFar(center)) due = this.lastRequestAt + AIRCRAFT_MIN_GAP_MS;
    else due = this.lastRequestAt + AIRCRAFT_POLL_MS;
    if (this.retryAfterUntil !== null) due = Math.max(due, this.retryAfterUntil);

    this.timer = this.deps.setTimer(
      () => {
        this.timer = null;
        void this.run();
      },
      Math.max(0, due - now),
    );
  }

  private movedFar(center: AircraftCenter): boolean {
    if (!this.lastCenter) return true;
    const km = haversineKm(this.lastCenter.lat, this.lastCenter.lon, center.lat, center.lon);
    return km / KM_PER_NM > AIRCRAFT_RECENTER_NM;
  }

  private async run(): Promise<void> {
    const center = this.activeCenter();
    if (!center || this.inflight || this.deps.isHidden()) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.inflight = controller;
    this.lastRequestAt = this.deps.now();
    this.lastCenter = center;
    const state = this.deps.getState();
    this.deps.setState({
      requests: state.requests + 1,
      status: state.snapshot ? state.status : 'loading',
    });

    const result = await this.deps.fetchArea(
      { lat: center.lat, lon: center.lon, radiusNm: AIRCRAFT_REQUEST_RADIUS_NM },
      controller.signal,
    );
    if (generation !== this.generation) return; // spento o sostituito nel frattempo
    this.inflight = null;

    const now = this.deps.now();
    if (result.kind === 'ok') {
      this.deps.setState({
        snapshot: result.snapshot,
        gatewayStale: result.gatewayStale,
        status: 'ok',
        error: null,
      });
      this.retryAfterUntil =
        result.gatewayStale && result.retryAfterMs !== null
          ? now + Math.max(result.retryAfterMs, AIRCRAFT_POLL_MS)
          : null;
    } else {
      // I dati precedenti restano: `aircraftView` li nasconde oltre l'età massima.
      this.deps.setState({ status: 'error', error: result.reason });
      this.retryAfterUntil = now + Math.max(result.retryAfterMs ?? 0, AIRCRAFT_POLL_MS);
    }
    this.schedule();
  }
}

let singleton: AircraftPoller | null = null;

/** Poller condiviso dell'app, collegato allo store e al browser. */
export function getAircraftPoller(): AircraftPoller {
  if (singleton) return singleton;
  singleton = new AircraftPoller({
    fetchArea: (area, signal) => fetchAircraftArea(area, { signal }),
    now: () => Date.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (h) => window.clearTimeout(h as number),
    isHidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
    subscribeVisibility: (cb) => {
      if (typeof document === 'undefined') return () => undefined;
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    getState: () => useAircraftStore.getState(),
    setState: (partial) => useAircraftStore.setState(partial),
  });
  return singleton;
}
