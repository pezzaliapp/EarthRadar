/**
 * Logica pura di CAM Explorer — data-driven, nessun territorio cablato.
 *
 * Le "aree" nascono dal registro delle fonti (campo `region`): aggiungere una
 * fonte (California, Canada, …) aggiunge automaticamente la sua area, senza
 * toccare la UI. Tutte le funzioni lavorano sull'intero catalogo: nessuna
 * camera viene esclusa, i limiti riguardano solo il rendering.
 */

export interface ExplorerCam {
  source: string;
  id: string;
  lat: number;
  lon: number;
  name: string;
  /** live = video reale · snap = immagine periodica (default snap). */
  type?: 'live' | 'snap';
}

export type CamTypeFilter = 'all' | 'live' | 'snap';

/** Filtro principale TUTTE | LIVE | SNAP (si combina con aree, zona mappa, ricerca). */
export function filterByType<T extends ExplorerCam>(cams: readonly T[], filter: CamTypeFilter): T[] {
  if (filter === 'all') return cams as T[];
  return cams.filter((c) => (c.type ?? 'snap') === filter);
}

/** Conteggi per il filtro principale. */
export function countByType(cams: readonly ExplorerCam[]): { all: number; live: number; snap: number } {
  let live = 0;
  for (const c of cams) if (c.type === 'live') live++;
  return { all: cams.length, live, snap: cams.length - live };
}

export interface ExplorerSourceMeta {
  label: string;
  region: { it: string; en: string };
}

export type SourceRegistry = Readonly<Record<string, ExplorerSourceMeta>>;

export interface CamArea {
  /** Chiave stabile dell'area (regione inglese normalizzata). */
  key: string;
  label: { it: string; en: string };
  count: number;
  /** Fonti che coprono l'area. */
  sources: string[];
}

export function areaKeyOf(meta: ExplorerSourceMeta): string {
  return normalizeText(meta.region.en).replace(/\s+/g, '-');
}

/** Aree presenti nel catalogo, dalla più ricca alla meno ricca. */
export function buildAreas(cams: readonly ExplorerCam[], registry: SourceRegistry): CamArea[] {
  const byKey = new Map<string, CamArea>();
  for (const c of cams) {
    const meta = registry[c.source];
    if (!meta) continue;
    const key = areaKeyOf(meta);
    let area = byKey.get(key);
    if (!area) {
      area = { key, label: meta.region, count: 0, sources: [] };
      byKey.set(key, area);
    }
    area.count++;
    if (!area.sources.includes(c.source)) area.sources.push(c.source);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Tutte le camere di un'area, ordinate per nome. */
export function camsInArea<T extends ExplorerCam>(
  cams: readonly T[],
  registry: SourceRegistry,
  areaKey: string,
): T[] {
  return cams
    .filter((c) => {
      const meta = registry[c.source];
      return meta !== undefined && areaKeyOf(meta) === areaKey;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Minuscolo, senza accenti/diacritici, spazi compattati. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .trim();
}

/** Testo ricercabile di una camera: nome, id, area (it/en), fonte. */
export function searchTextOf(c: ExplorerCam, registry: SourceRegistry): string {
  const meta = registry[c.source];
  return normalizeText(
    [c.name, c.id, meta?.region.it ?? '', meta?.region.en ?? '', meta?.label ?? ''].join(' '),
  );
}

/**
 * Ricerca locale: ogni parola della query deve comparire nel testo della
 * camera. `index[i]` è il testo ricercabile di `cams[i]` (precalcolato).
 */
export function searchCams<T extends ExplorerCam>(
  cams: readonly T[],
  index: readonly string[],
  query: string,
): T[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < cams.length; i++) {
    const text = index[i];
    if (tokens.every((t) => text.includes(t))) out.push(cams[i]);
  }
  return out;
}

const EARTH_RADIUS_KM = 6371;

/** Distanza ortodromica (km). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface CamWithDistance<T> {
  cam: T;
  km: number;
}

/** Intero catalogo ordinato per distanza da (lat, lon). */
export function sortByDistance<T extends ExplorerCam>(
  cams: readonly T[],
  lat: number,
  lon: number,
): CamWithDistance<T>[] {
  return cams
    .map((cam) => ({ cam, km: distanceKm(lat, lon, cam.lat, cam.lon) }))
    .sort((a, b) => a.km - b.km);
}

/**
 * Centro di riferimento per "Zona mappa", arrotondato (~2 km): piccoli
 * spostamenti non riordinano l'elenco.
 */
export function roundCenter(lat: number, lon: number): [number, number] {
  return [Math.round(lat * 50) / 50, Math.round(lon * 50) / 50];
}

/** Distanza leggibile. */
export function formatKm(km: number, language: 'it' | 'en'): string {
  const locale = language === 'it' ? 'it-IT' : 'en-GB';
  if (km < 10) return `${km.toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
  return `${Math.round(km).toLocaleString(locale)} km`;
}

/**
 * Conteggio con separatore delle migliaia sempre presente ("2.629" / "2,629"):
 * la regola CLDR italiana non raggrupperebbe i numeri a 4 cifre.
 */
export function formatCount(n: number, language: 'it' | 'en'): string {
  const sep = language === 'it' ? '.' : ',';
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
