import { useEffect, useState } from 'react';
import {
  fetchQuakes,
  type Quake,
  type FetchQuakesOpts,
  type QuakeFeed,
} from '@/services/usgsQuakesApi';
import type { CacheSource } from '@/lib/apiCache';

export interface UseQuakesState {
  data: Quake[];
  source: CacheSource | 'pending';
  error: string | null;
  loading: boolean;
  fetchedAt: number | null;
  refresh: () => Promise<void>;
}

const DEFAULT_POLL_MS = 5 * 60 * 1000; // 5 min, allineato al TTL cache

export function useQuakes(
  feed: QuakeFeed = 'all_day',
  opts: { pollMs?: number } = {},
): UseQuakesState {
  const [state, setState] = useState<{
    data: Quake[];
    source: CacheSource | 'pending';
    error: string | null;
    loading: boolean;
    fetchedAt: number | null;
  }>({ data: [], source: 'pending', error: null, loading: true, fetchedAt: null });

  async function load(force = false) {
    setState((s) => ({ ...s, loading: true }));
    try {
      const fetchOpts: FetchQuakesOpts = { feed, force };
      const r = await fetchQuakes(fetchOpts);
      setState({
        data: r.value,
        source: r.source,
        error: null,
        loading: false,
        fetchedAt: r.fetchedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, error: msg, loading: false }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    load();
    const id = window.setInterval(() => {
      if (!cancelled) load();
    }, opts.pollMs ?? DEFAULT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, opts.pollMs]);

  return { ...state, refresh: () => load(true) };
}
