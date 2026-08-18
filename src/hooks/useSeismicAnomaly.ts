import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRecentSeismicity, fetchSeismicBaseline } from '@/services/seismicAnomalyApi';
import {
  computeAnomalyAnalysis,
  type AnomalyAnalysis,
  type SeismicBaseline,
  type SeismicEvent,
  type SeismicThreshold,
  type SeismicWindowDays,
} from '@/lib/seismicAnalysis';
import type { CacheSource } from '@/lib/apiCache';

export interface UseSeismicAnomalyState {
  analysis: AnomalyAnalysis | null;
  /** Sorgente combinata: 'fallback'/'stale' se una delle due lo è. */
  source: CacheSource | 'pending';
  loading: boolean;
  error: string | null;
  /** Istante dell'ultimo aggiornamento dati recenti (epoch ms). */
  fetchedAt: number | null;
  /** Metadati della baseline (fonte, periodo, metodologia). */
  baselineMeta: SeismicBaseline['meta'] | null;
  refresh: () => Promise<void>;
}

/** Combina la peggiore delle due sorgenti (fresh < stale < fallback). */
function worstSource(a: CacheSource, b: CacheSource): CacheSource {
  const rank: Record<CacheSource, number> = { fresh: 0, stale: 1, fallback: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Hook che carica baseline + eventi recenti e calcola l'analisi per la finestra
 * e la soglia selezionate. Gli eventi recenti (90 giorni M≥5.5) vengono scaricati
 * UNA volta e ri-filtrati localmente al cambio di finestra/soglia: nessuna nuova
 * richiesta di rete quando l'utente cambia i selettori.
 */
export function useSeismicAnomaly(
  windowDays: SeismicWindowDays,
  threshold: SeismicThreshold,
): UseSeismicAnomalyState {
  const [events, setEvents] = useState<SeismicEvent[] | null>(null);
  const [baseline, setBaseline] = useState<SeismicBaseline | null>(null);
  const [state, setState] = useState<{
    source: CacheSource | 'pending';
    loading: boolean;
    error: string | null;
    fetchedAt: number | null;
    now: number;
  }>({ source: 'pending', loading: true, error: null, fetchedAt: null, now: Date.now() });

  const mountedRef = useRef(true);

  async function load() {
    if (!mountedRef.current) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const [recent, base] = await Promise.all([fetchRecentSeismicity(), fetchSeismicBaseline()]);
      if (!mountedRef.current) return;
      setEvents(recent.value);
      setBaseline(base.value);
      setState({
        source: worstSource(recent.source, base.source),
        loading: false,
        error: null,
        fetchedAt: recent.fetchedAt,
        now: Date.now(),
      });
    } catch (e) {
      if (!mountedRef.current) return;
      const msg = e instanceof Error ? e.message : 'unknown error';
      setState((s) => ({ ...s, error: msg, loading: false }));
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const analysis = useMemo<AnomalyAnalysis | null>(() => {
    if (!events || !baseline) return null;
    return computeAnomalyAnalysis({ baseline, events, windowDays, threshold, now: state.now });
  }, [events, baseline, windowDays, threshold, state.now]);

  return {
    analysis,
    source: state.source,
    loading: state.loading,
    error: state.error,
    fetchedAt: state.fetchedAt,
    baselineMeta: baseline?.meta ?? null,
    refresh: load,
  };
}
