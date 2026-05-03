import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchIssState, type IssResult, type IssState } from '@/services/issApi';
import { fetchGroup, type SatelliteRecord } from '@/services/celestrakApi';
import { propagateSatrec, tleToSatrec, type Satrec } from '@/lib/sgp4Lite';

const ISS_NORAD = 25544;
const LIVE_POLL_MS = 10_000;
const TLE_REFRESH_MS = 6 * 60 * 60 * 1000;
const SMOOTH_TICK_MS = 1000;

export interface UseIssState {
  /** Ultimo fix live wheretheiss (mai null se almeno una fetch è riuscita). */
  live: IssState | null;
  /** Sorgente del fix live (fresh/stale/pending). */
  source: IssResult['source'];
  /** Posizione corrente smoothata da SGP4 (1Hz). Se manca il TLE, ricade su `live`. */
  smoothLat: number | null;
  smoothLon: number | null;
  smoothAltKm: number | null;
  /** Velocità SGP4 in km/h (se disponibile). */
  smoothVelocityKmh: number | null;
  /** TLE ISS dal gruppo `stations` per propagator esterni (panel passi). */
  satrec: Satrec | null;
  /** Record SatelliteRecord ISS dal gruppo `stations` (per epoch/age TLE). */
  iss: SatelliteRecord | null;
  /** Timestamp ms dell'ultimo fix live riuscito. */
  fetchedAt: number | null;
  error: string | null;
}

/**
 * Hook ISS combinato:
 *  - poll wheretheiss.at ogni 10s (fonte di verità per visibility + lat/lon)
 *  - in parallelo scarica il TLE stations da CelesTrak (TTL 6h) per ottenere
 *    `satrec` riusato dal pass predictor e per smoothing 1Hz
 *  - tick interno 1Hz: propaga il satrec all'istante corrente. Se il TLE non
 *    è disponibile (offline al primo lancio) ripiega sul fix live e basta.
 */
export function useIss(enabled: boolean): UseIssState {
  const [live, setLive] = useState<IssState | null>(null);
  const [source, setSource] = useState<IssResult['source']>('pending');
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iss, setIss] = useState<SatelliteRecord | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  // satrec memo: ricostruito una sola volta quando arriva un TLE nuovo.
  const satrec: Satrec | null = useMemo(() => {
    if (!iss) return null;
    try {
      return tleToSatrec(iss.tle);
    } catch {
      return null;
    }
  }, [iss]);

  const liveRef = useRef<IssState | null>(null);
  liveRef.current = live;

  // Poll wheretheiss live.
  useEffect(() => {
    if (!enabled) {
      setLive(null);
      setSource('pending');
      setFetchedAt(null);
      setError(null);
      return;
    }
    let cancelled = false;
    async function loadLive() {
      try {
        const r = await fetchIssState();
        if (cancelled) return;
        setLive(r.value);
        setSource(r.source);
        setFetchedAt(r.fetchedAt);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'unknown error');
      }
    }
    loadLive();
    const id = window.setInterval(loadLive, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  // TLE refresh dal gruppo stations.
  useEffect(() => {
    if (!enabled) {
      setIss(null);
      return;
    }
    let cancelled = false;
    async function loadTle() {
      try {
        const r = await fetchGroup('stations');
        if (cancelled) return;
        const issRec = r.value.find((rec) => rec.noradId === ISS_NORAD) ?? null;
        setIss(issRec);
      } catch {
        // silenzioso: senza TLE manca solo lo smoothing, non i fix live.
      }
    }
    loadTle();
    const id = window.setInterval(loadTle, TLE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  // Tick 1Hz per smoothing.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick(Date.now()), SMOOTH_TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  const smooth = useMemo(() => {
    if (satrec) {
      const p = propagateSatrec(satrec, new Date(tick));
      if (p) {
        return {
          lat: p.lat,
          lon: p.lon,
          alt: p.alt,
          velocityKmh: (p.velocityKms ?? 0) * 3600,
        };
      }
    }
    if (live) {
      return {
        lat: live.lat,
        lon: live.lon,
        alt: live.altKm,
        velocityKmh: live.velocityKmh,
      };
    }
    return null;
  }, [satrec, tick, live]);

  return {
    live,
    source,
    smoothLat: smooth?.lat ?? null,
    smoothLon: smooth?.lon ?? null,
    smoothAltKm: smooth?.alt ?? null,
    smoothVelocityKmh: smooth?.velocityKmh ?? null,
    satrec,
    iss,
    fetchedAt,
    error,
  };
}
