/**
 * seismicAnomalyApi.ts — accesso dati per la funzione "Anomalia Sismica".
 *
 * Due sorgenti, entrambe pubbliche e gratuite USGS:
 *
 *  1. EVENTI RECENTI — una singola query FDSN "live" per gli ultimi 90 giorni
 *     (finestra massima analizzata) a M≥5.5. Da questo superset l'app deriva
 *     client-side tutte le finestre (30/60/90) e le soglie (5.5/6.0/7.0):
 *     una sola richiesta di rete per l'intera pagina.
 *
 *  2. BASELINE STORICA — dataset aggregato statico e compatto
 *     (`/EarthRadar/data/seismic-baseline.json`) generato in fase di build da
 *     `scripts/generateSeismicBaseline.mjs`. NON si riscarica il catalogo
 *     ventennale all'apertura.
 *
 * Entrambe passano da `apiCache` (idb-keyval) con fallback a cache stale/offline.
 * Nessuna API key, nessun backend, nessun costo.
 */

import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';
import { parseUsgsFeatureCollection } from '@/services/usgsQuakesApi';
import type { SeismicBaseline, SeismicEvent } from '@/lib/seismicAnalysis';

const FDSN_ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const BASELINE_URL = '/EarthRadar/data/seismic-baseline.json';

/** Finestra massima analizzata: scarichiamo una volta 90 giorni e filtriamo. */
export const MAX_WINDOW_DAYS = 90;
/** Soglia base: superset da cui derivare le soglie superiori. */
export const BASE_MIN_MAG = 5.5;

const RECENT_TTL_MS = 30 * 60 * 1000; // 30 min
const BASELINE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni (dato statico/versionato)

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Scarica gli eventi recenti M≥5.5 degli ultimi `MAX_WINDOW_DAYS` giorni.
 * `now` iniettabile per test deterministici.
 */
export async function fetchRecentSeismicity(
  now: number = Date.now(),
): Promise<CachedResult<SeismicEvent[]>> {
  const start = isoDate(now - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const url =
    `${FDSN_ENDPOINT}?format=geojson&starttime=${start}` +
    `&minmagnitude=${BASE_MIN_MAG}&orderby=time-asc`;
  // Chiave stabile per giorno: evita richieste ripetute nella stessa giornata,
  // resta coerente con il TTL di 30 min per gli aggiornamenti infragiornalieri.
  const dayKey = isoDate(now);
  return cachedFetchTraced<SeismicEvent[]>({
    key: `earthradar:seismic:recent:${dayKey}`,
    ttlMs: RECENT_TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, {
        headers: { Accept: 'application/geo+json,application/json' },
      });
      if (!res.ok) throw new Error(`USGS FDSN HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      // Riusa il parser difensivo di usgsQuakesApi, poi proietta nel modello minimale.
      return parseUsgsFeatureCollection(json).map((q) => ({
        time: q.time,
        mag: q.magnitude,
        lat: q.lat,
        lon: q.lon,
        place: q.place,
      }));
    },
  });
}

/** Carica la baseline storica statica (cache lunga, offline-friendly). */
export async function fetchSeismicBaseline(): Promise<CachedResult<SeismicBaseline>> {
  return cachedFetchTraced<SeismicBaseline>({
    key: 'earthradar:seismic:baseline:v1',
    ttlMs: BASELINE_TTL_MS,
    fetcher: async () => {
      const res = await fetch(BASELINE_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`baseline HTTP ${res.status}`);
      return (await res.json()) as SeismicBaseline;
    },
  });
}
