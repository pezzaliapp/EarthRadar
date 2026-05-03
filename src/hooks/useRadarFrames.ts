import { useEffect, useState } from 'react';
import { fetchRadarFrames, type RadarFrames } from '@/services/rainviewerApi';
import type { CacheSource } from '@/lib/apiCache';

export interface UseRadarFramesState {
  frames: RadarFrames | null;
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
}

const POLL_MS = 5 * 60 * 1000; // = TTL discovery

/**
 * Carica i frame RainViewer e li mantiene aggiornati ogni 5 min.
 * Disabilitato quando `enabled=false`.
 */
export function useRadarFrames(enabled: boolean): UseRadarFramesState {
  const [state, setState] = useState<UseRadarFramesState>({
    frames: null,
    source: 'pending',
    loading: enabled,
    error: null,
  });

  async function load() {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await fetchRadarFrames();
      setState({ frames: r.value, source: r.source, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  useEffect(() => {
    if (!enabled) {
      setState({ frames: null, source: 'pending', loading: false, error: null });
      return;
    }
    let cancelled = false;
    load();
    const id = window.setInterval(() => {
      if (!cancelled) load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return state;
}
