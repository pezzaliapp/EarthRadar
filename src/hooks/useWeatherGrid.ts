import { useEffect, useRef, useState } from 'react';
import { fetchCurrent, fetchGrid, type WeatherCell, type WeatherPoint } from '@/services/openMeteoApi';
import type { CacheSource } from '@/lib/apiCache';

const DEBOUNCE_MS = 1000;
/** Pollin'g a 15 min: TTL della cache; il debounce gestisce i pan/zoom. */
const POLL_MS = 15 * 60 * 1000;

export interface UseWeatherGridState {
  center: WeatherPoint | null;
  cells: WeatherCell[];
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Hook che recupera meteo a centro mappa + 8 celle direzionali.
 * Debounce 1 s sui cambi di centro (`lat`, `lon`, `gridStepKm`) per non
 * martellare l'API durante pan/zoom.
 */
export function useWeatherGrid(
  enabled: boolean,
  lat: number,
  lon: number,
  gridStepKm: number,
): UseWeatherGridState {
  const [state, setState] = useState<{
    center: WeatherPoint | null;
    cells: WeatherCell[];
    source: CacheSource | 'pending';
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
  }>({
    center: null,
    cells: [],
    source: 'pending',
    loading: enabled,
    error: null,
    fetchedAt: null,
  });

  // Mantengo i parametri attuali in un ref per il refresh manuale.
  const paramsRef = useRef({ lat, lon, gridStepKm });
  paramsRef.current = { lat, lon, gridStepKm };

  async function load() {
    const { lat, lon, gridStepKm } = paramsRef.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const [centerR, gridR] = await Promise.all([
        fetchCurrent(lat, lon),
        fetchGrid(lat, lon, gridStepKm),
      ]);
      setState({
        center: centerR.value,
        cells: gridR.cells,
        source: centerR.source,
        loading: false,
        error: null,
        fetchedAt: centerR.fetchedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  useEffect(() => {
    if (!enabled) {
      setState({
        center: null,
        cells: [],
        source: 'pending',
        loading: false,
        error: null,
        fetchedAt: null,
      });
      return;
    }
    let cancelled = false;
    const debounceId = window.setTimeout(() => {
      if (!cancelled) load();
    }, DEBOUNCE_MS);
    const pollId = window.setInterval(() => {
      if (!cancelled) load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(debounceId);
      window.clearInterval(pollId);
    };
  }, [enabled, lat, lon, gridStepKm]);

  return { ...state, refresh: load };
}
