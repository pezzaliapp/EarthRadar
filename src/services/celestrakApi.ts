import { cachedFetchTraced, type CachedResult } from '@/lib/apiCache';
import { parseGpRecord, type GpRecord, type TleSet } from '@/lib/sgp4Lite';
import {
  DEFAULT_GROUPS,
  GROUP_CATALOG,
  type CelestrakGroup,
  type CelestrakGroupSpec,
} from './celestrakGroups';

/**
 * CelesTrak GP — API pubblica senza autenticazione.
 * Documentazione: https://celestrak.org/NORAD/documentation/gp-data-formats.php
 *
 * Strategia:
 *  - 1 fetch per gruppo, FORMAT=json (GP-JSON). TTL 6 h.
 *  - Fallback locale: stations TLE statiche (ISS + qualche stazione).
 *  - Limite per gruppo (es. starlink → 200 oggetti) per non saturare il device.
 *
 * Le costanti gruppo vivono in `celestrakGroups.ts` per non tirare `satellite.js`
 * dentro chi importa solo il catalogo (layersStore, LayerPanel).
 */

export {
  DEFAULT_GROUPS,
  GROUP_CATALOG,
};
export type { CelestrakGroup, CelestrakGroupSpec };

const TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_URL = '/EarthRadar/fallback-data/celestrak-stations.json';

export interface SatelliteRecord {
  /** TLE 3-line normalizzato. */
  tle: TleSet;
  /** Subset GP utile per UI (NORAD id, epoch, mean motion ecc.). */
  gp: GpRecord;
  /** Comodità: NORAD cat ID. */
  noradId: number;
  /** Nome dell'oggetto. */
  name: string;
  /** Gruppo CelesTrak di provenienza (utile per filtri). */
  group: CelestrakGroup;
}

/**
 * Fetch + parsing GP-JSON di un gruppo CelesTrak. Limita a `limit` oggetti se passato.
 * Riporta sempre un risultato `CachedResult` con la sorgente (`fresh|stale|fallback`).
 */
export async function fetchGroup(
  group: CelestrakGroup,
  opts: { limit?: number } = {},
): Promise<CachedResult<SatelliteRecord[]>> {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  return cachedFetchTraced<SatelliteRecord[]>({
    key: `earthradar:celestrak:${group}`,
    ttlMs: TTL_MS,
    fetcher: async () => {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`CelesTrak ${group} HTTP ${res.status}`);
      const json = (await res.json()) as unknown;
      const records = parseGpJsonArray(json, group);
      return applyLimit(records, opts.limit);
    },
    fallback: async () => {
      // Fallback solo per il gruppo stations (ISS+).
      if (group !== 'stations') return [];
      try {
        const res = await fetch(FALLBACK_URL, { cache: 'no-store' });
        if (!res.ok) return [];
        const json = (await res.json()) as unknown;
        return applyLimit(parseGpJsonArray(json, group), opts.limit);
      } catch {
        return [];
      }
    },
  });
}

/**
 * Fetch parallelo di più gruppi. Restituisce records merged + un meta map per gruppo.
 */
export async function fetchGroups(
  groups: CelestrakGroup[],
): Promise<{
  records: SatelliteRecord[];
  bySource: Record<string, { count: number; source: CachedResult<SatelliteRecord[]>['source'] }>;
}> {
  const specs = groups
    .map((id) => GROUP_CATALOG.find((g) => g.id === id) ?? { id })
    .map((spec) => fetchGroup(spec.id, { limit: spec.limit }).then((r) => [spec.id, r] as const));
  const settled = await Promise.allSettled(specs);
  const records: SatelliteRecord[] = [];
  const bySource: Record<string, { count: number; source: CachedResult<SatelliteRecord[]>['source'] }> = {};
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const [groupId, result] = r.value;
      records.push(...result.value);
      bySource[groupId] = { count: result.value.length, source: result.source };
    } else {
      // ignora il gruppo singolo che ha fallito tutto (nessuna stale, nessun fallback)
    }
  }
  // Deduplica per NORAD id (un satellite può comparire in più gruppi)
  const seen = new Set<number>();
  const deduped: SatelliteRecord[] = [];
  for (const rec of records) {
    if (seen.has(rec.noradId)) continue;
    seen.add(rec.noradId);
    deduped.push(rec);
  }
  return { records: deduped, bySource };
}

/** Parser difensivo — scarta record che non producono un TLE valido. */
export function parseGpJsonArray(input: unknown, group: CelestrakGroup): SatelliteRecord[] {
  if (!Array.isArray(input)) return [];
  const out: SatelliteRecord[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const gp = raw as GpRecord;
    if (gp.NORAD_CAT_ID === undefined || gp.NORAD_CAT_ID === null) continue;
    const tle = parseGpRecord(gp);
    if (!tle) continue;
    out.push({
      tle,
      gp,
      noradId: Number(gp.NORAD_CAT_ID),
      name: tle.name,
      group,
    });
  }
  return out;
}

function applyLimit(records: SatelliteRecord[], limit?: number): SatelliteRecord[] {
  if (!limit || records.length <= limit) return records;
  // Per i gruppi capped (starlink) prendiamo gli oggetti con epoch più recente,
  // proxy ragionevole di "più aggiornati e quindi più affidabili".
  const sorted = [...records].sort((a, b) => {
    const ea = a.gp.EPOCH ? Date.parse(a.gp.EPOCH) : 0;
    const eb = b.gp.EPOCH ? Date.parse(b.gp.EPOCH) : 0;
    return eb - ea;
  });
  return sorted.slice(0, limit);
}
