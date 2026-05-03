import { useEffect, useRef, useState } from 'react';
import {
  firmsMapKey,
  getHotspots,
  type FirmsBbox,
  type FirmsDayRange,
  type FirmsHotspot,
  type FirmsSource,
} from '@/services/firmsApi';
import type { CacheSource } from '@/lib/apiCache';

const POLL_MS = 5 * 60 * 1000; // 5 min, allineato al TTL FIRMS / 6
const MIN_BBOX_CHANGE_MS = 1500;

export type FiresMode = 'firms' | 'fallback-gibs' | 'pending';

export interface UseFiresState {
  /** Hotspot real-time. Vuoto se mode === 'fallback-gibs' o pending. */
  hotspots: FirmsHotspot[];
  /** Modalità corrente (FIRMS attivo o fallback GIBS in vigore). */
  mode: FiresMode;
  /** Sorgente del valore di ritorno (fresh/stale/fallback) — pertinente solo a `firms`. */
  source: CacheSource | 'pending';
  /** True se VITE_FIRMS_MAP_KEY non è configurata. */
  missingKey: boolean;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  /** Ricarica forzata (bypass debounce viewport). */
  refresh: () => Promise<void>;
}

interface UseFiresOpts {
  bbox: FirmsBbox | null;
  source: FirmsSource;
  dayRange: FirmsDayRange;
}

/**
 * Hook FIRMS:
 *  - rileva la map key all'avvio. Se manca → mode `fallback-gibs` immediato,
 *    nessuna chiamata di rete e l'UI deve attivare il GibsFiresOverlay.
 *  - se la key c'è → poll sul bbox del viewport, source, dayRange.
 *  - debounce sul bbox: se l'utente sta panneggiando rapidamente, attendiamo
 *    1.5 s di stabilità prima di rifare la chiamata FIRMS (rate limit).
 */
export function useFires(enabled: boolean, opts: UseFiresOpts): UseFiresState {
  const [state, setState] = useState<{
    hotspots: FirmsHotspot[];
    mode: FiresMode;
    source: CacheSource | 'pending';
    missingKey: boolean;
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
  }>(() => {
    const missing = firmsMapKey() === null;
    return {
      hotspots: [],
      mode: missing ? 'fallback-gibs' : 'pending',
      source: 'pending',
      missingKey: missing,
      loading: enabled && !missing,
      error: null,
      fetchedAt: null,
    };
  });

  const lastBboxKeyRef = useRef<string>('');
  const cancelTimerRef = useRef<number | null>(null);

  async function load() {
    if (!opts.bbox) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await getHotspots({
        bbox: opts.bbox,
        source: opts.source,
        dayRange: opts.dayRange,
      });
      if (r.missingKey) {
        setState({
          hotspots: [],
          mode: 'fallback-gibs',
          source: 'fallback',
          missingKey: true,
          loading: false,
          error: null,
          fetchedAt: r.fetchedAt,
        });
        return;
      }
      setState({
        hotspots: r.value,
        mode: 'firms',
        source: r.source,
        missingKey: false,
        loading: false,
        error: null,
        fetchedAt: r.fetchedAt,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'unknown error',
      }));
    }
  }

  // Effect 1: gating su enabled / missingKey.
  useEffect(() => {
    if (!enabled) {
      setState((s) => ({ ...s, hotspots: [], loading: false, error: null }));
      return;
    }
    if (firmsMapKey() === null) {
      setState((s) => ({
        ...s,
        hotspots: [],
        mode: 'fallback-gibs',
        missingKey: true,
        loading: false,
      }));
      return;
    }
    setState((s) => ({ ...s, missingKey: false }));
  }, [enabled]);

  // Effect 2: refetch su (bbox, source, dayRange) con debounce sul bbox.
  useEffect(() => {
    if (!enabled || !opts.bbox || firmsMapKey() === null) return;
    const bboxKey = opts.bbox.join(',');
    if (bboxKey === lastBboxKeyRef.current) {
      // Cambio di source o dayRange con stesso bbox → ricarica subito.
      load();
      return;
    }
    lastBboxKeyRef.current = bboxKey;
    if (cancelTimerRef.current) window.clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = window.setTimeout(load, MIN_BBOX_CHANGE_MS);
    return () => {
      if (cancelTimerRef.current) window.clearTimeout(cancelTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.bbox?.join(','), opts.source, opts.dayRange]);

  // Effect 3: polling regolare (5 min) per refresh dei dati FIRMS.
  useEffect(() => {
    if (!enabled || firmsMapKey() === null) return;
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, opts.source, opts.dayRange]);

  return { ...state, refresh: load };
}
