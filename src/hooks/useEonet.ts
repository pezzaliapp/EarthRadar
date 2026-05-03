import { useEffect, useState } from 'react';
import { getEvents, type EonetEvent, type GetEventsOpts } from '@/services/eonetApi';
import type { CacheSource } from '@/lib/apiCache';

const POLL_MS = 10 * 60 * 1000;

export interface UseEonetState {
  data: EonetEvent[];
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => Promise<void>;
}

interface UseEonetOpts {
  status?: 'open' | 'all';
  days?: number;
  categoryIds?: string[];
}

/**
 * Hook EONET v3 — fetch + cache + poll 10 min.
 * Saltato quando `enabled === false` per evitare chiamate inutili
 * quando il layer è spento (allineato a useAircraft).
 */
export function useEonet(enabled: boolean, opts: UseEonetOpts = {}): UseEonetState {
  const status = opts.status ?? 'open';
  const days = opts.days ?? 30;
  const cats = (opts.categoryIds ?? []).slice().sort();
  const catsKey = cats.join(',');

  const [state, setState] = useState<{
    data: EonetEvent[];
    source: CacheSource | 'pending';
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
  }>({
    data: [],
    source: 'pending',
    loading: enabled,
    error: null,
    fetchedAt: null,
  });

  async function load() {
    setState((s) => ({ ...s, loading: true }));
    try {
      const fetchOpts: GetEventsOpts = { status, days };
      if (cats.length > 0) fetchOpts.categoryIds = cats;
      const r = await getEvents(fetchOpts);
      setState({
        data: r.value,
        source: r.source,
        loading: false,
        error: null,
        fetchedAt: r.fetchedAt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  useEffect(() => {
    if (!enabled) {
      setState({ data: [], source: 'pending', loading: false, error: null, fetchedAt: null });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status, days, catsKey]);

  return { ...state, refresh: load };
}
