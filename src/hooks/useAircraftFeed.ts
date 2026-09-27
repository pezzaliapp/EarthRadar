import { useEffect, useState } from 'react';
import { getAircraftPoller } from '@/services/aircraftPoller';
import { aircraftView, useAircraftStore, type AircraftView } from '@/store/aircraftStore';

/**
 * Dichiara la domanda di traffico aereo di una pagina (una per pagina:
 * Home, RadarMode). NON fa fetch: è il poller unico a decidere quando.
 */
export function useAircraftDemand(id: string, enabled: boolean, lat: number, lon: number): void {
  useEffect(() => {
    getAircraftPoller().setDemand(id, { enabled, center: { lat, lon } });
  }, [id, enabled, lat, lon]);
  useEffect(() => () => getAircraftPoller().setDemand(id, null), [id]);
}

const CLOCK_MS = 5_000;

/**
 * Lettura del traffico aereo condiviso (sola lettura, nessuna richiesta).
 * Ricalcola ogni 5 s lo stato di freschezza (LIVE → stale → non disponibile).
 */
export function useAircraftView(): AircraftView {
  const state = useAircraftStore();
  const [now, setNow] = useState(() => Date.now());
  const active = state.status !== 'off';
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, [active, state.snapshot]);
  return aircraftView(state, now);
}
