import { useEffect, useState } from 'react';
import type { CacheSource } from '@/lib/apiCache';
import { loadCamCatalog, type Cam } from '@/services/camCatalog';

export interface UseCamCatalogState {
  cams: Cam[];
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

const IDLE: UseCamCatalogState = {
  cams: [],
  source: 'pending',
  loading: false,
  error: null,
  fetchedAt: null,
};

/**
 * Catalogo CAM. Con `enabled === false` non fa NULLA: nessuna richiesta,
 * nessun timer, nessun listener. Nessun polling: il catalogo è statico.
 */
export function useCamCatalog(enabled: boolean): UseCamCatalogState {
  const [state, setState] = useState<UseCamCatalogState>(IDLE);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadCamCatalog()
      .then((r) => {
        if (cancelled) return;
        setState({
          cams: r.value.cams,
          source: r.source,
          loading: false,
          error: null,
          fetchedAt: r.fetchedAt,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ ...IDLE, error: e instanceof Error ? e.message : 'unknown error' });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
