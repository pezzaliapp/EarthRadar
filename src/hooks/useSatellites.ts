import { useEffect, useState } from 'react';
import { fetchGroups, type CelestrakGroup, type SatelliteRecord } from '@/services/celestrakApi';
import type { CacheSource } from '@/lib/apiCache';

export interface UseSatellitesState {
  records: SatelliteRecord[];
  /** Sorgente "peggiore" tra i gruppi (fresh > stale > fallback). */
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
  bySource: Record<string, { count: number; source: CacheSource }>;
  refresh: () => Promise<void>;
}

const REFRESH_MS = 6 * 60 * 60 * 1000; // = TTL CelesTrak

function worstSource(map: Record<string, { source: CacheSource }>): CacheSource | 'pending' {
  const sources = Object.values(map).map((m) => m.source);
  if (sources.length === 0) return 'pending';
  if (sources.includes('fallback')) return 'fallback';
  if (sources.includes('stale')) return 'stale';
  return 'fresh';
}

export function useSatellites(groups: CelestrakGroup[]): UseSatellitesState {
  const [state, setState] = useState<{
    records: SatelliteRecord[];
    source: CacheSource | 'pending';
    loading: boolean;
    error: string | null;
    bySource: Record<string, { count: number; source: CacheSource }>;
  }>({
    records: [],
    source: 'pending',
    loading: groups.length > 0,
    error: null,
    bySource: {},
  });

  async function load() {
    if (groups.length === 0) {
      setState({ records: [], source: 'pending', loading: false, error: null, bySource: {} });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    try {
      const { records, bySource } = await fetchGroups(groups);
      setState({
        records,
        source: worstSource(bySource),
        loading: false,
        error: null,
        bySource,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    load();
    const id = window.setInterval(() => {
      if (!cancelled) load();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.join('|')]);

  return { ...state, refresh: load };
}
