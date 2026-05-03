import { useEffect, useState } from 'react';
import { fetchAircraft, type Aircraft } from '@/services/openSkyApi';
import type { CacheSource } from '@/lib/apiCache';
import type { RateLimitState } from '@/services/openSkyRateLimit';

const POLL_MS = 30_000;

export interface UseAircraftState {
  data: Aircraft[];
  source: CacheSource | 'pending' | 'saturated';
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  rateLimit: RateLimitState | null;
  refresh: () => Promise<void>;
}

/**
 * Hook OpenSky:
 *  - poll fisso a 30 s
 *  - saltato durante cooldown (lo state diventa `saturated` ma i dati restano
 *    quelli dell'ultima cache, cosicché i marker non spariscano)
 *  - propaga il `rateLimit` al SourceBadge
 */
export function useAircraft(enabled: boolean): UseAircraftState {
  const [state, setState] = useState<{
    data: Aircraft[];
    source: CacheSource | 'pending' | 'saturated';
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
    rateLimit: RateLimitState | null;
  }>({
    data: [],
    source: 'pending',
    loading: enabled,
    error: null,
    fetchedAt: null,
    rateLimit: null,
  });

  async function load() {
    setState((s) => ({ ...s, loading: true }));
    try {
      const r = await fetchAircraft();
      setState({
        data: r.value,
        source: r.skippedDueToRateLimit ? 'saturated' : r.source,
        loading: false,
        error: null,
        fetchedAt: r.fetchedAt,
        rateLimit: r.rateLimit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  useEffect(() => {
    if (!enabled) {
      setState({
        data: [],
        source: 'pending',
        loading: false,
        error: null,
        fetchedAt: null,
        rateLimit: null,
      });
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

  return { ...state, refresh: load };
}
