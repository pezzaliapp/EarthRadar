/**
 * Clustering a griglia del layer CAM, senza dipendenze.
 *
 * Un unico algoritmo O(n) usato da 2D e 3D; cambia solo la funzione che
 * assegna ogni punto a una cella:
 *  - 2D (Leaflet): celle in pixel al livello di zoom corrente;
 *  - 3D (globo):   celle in gradi, proporzionali all'altitudine della camera.
 *
 * Una cella con un solo punto resta un punto singolo; con più punti diventa un
 * cluster posizionato sul baricentro, con i bounds dei membri (per lo zoom).
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type GridItem<T extends GeoPoint> =
  | { kind: 'single'; lat: number; lon: number; point: T }
  | {
      kind: 'cluster';
      key: string;
      lat: number;
      lon: number;
      count: number;
      bounds: Bounds;
      /** Membri che soddisfano `isFlagged` (es. camere LIVE). */
      flagged: number;
    };

/** Coordinate intere della cella di un punto. */
export type CellFn<T> = (p: T) => [number, number];

interface Acc<T> {
  first: T;
  count: number;
  flagged: number;
  sumLat: number;
  sumLon: number;
  bounds: Bounds;
}

/**
 * Raggruppa i punti per cella. Output ordinato per numerosità decrescente,
 * poi troncato a `maxItems` (i cluster più grandi hanno la precedenza).
 */
export function gridCluster<T extends GeoPoint>(
  points: readonly T[],
  cellOf: CellFn<T>,
  maxItems: number,
  isFlagged?: (p: T) => boolean,
): GridItem<T>[] {
  const cells = new Map<string, Acc<T>>();
  for (const p of points) {
    const [cx, cy] = cellOf(p);
    const key = `${cx}:${cy}`;
    const acc = cells.get(key);
    if (!acc) {
      cells.set(key, {
        first: p,
        count: 1,
        flagged: isFlagged?.(p) ? 1 : 0,
        sumLat: p.lat,
        sumLon: p.lon,
        bounds: { south: p.lat, north: p.lat, west: p.lon, east: p.lon },
      });
      continue;
    }
    acc.count++;
    if (isFlagged?.(p)) acc.flagged++;
    acc.sumLat += p.lat;
    acc.sumLon += p.lon;
    const b = acc.bounds;
    if (p.lat < b.south) b.south = p.lat;
    if (p.lat > b.north) b.north = p.lat;
    if (p.lon < b.west) b.west = p.lon;
    if (p.lon > b.east) b.east = p.lon;
  }

  const items: GridItem<T>[] = [];
  for (const [key, acc] of cells) {
    if (acc.count === 1) {
      items.push({ kind: 'single', lat: acc.first.lat, lon: acc.first.lon, point: acc.first });
    } else {
      items.push({
        kind: 'cluster',
        key,
        lat: acc.sumLat / acc.count,
        lon: acc.sumLon / acc.count,
        count: acc.count,
        bounds: acc.bounds,
        flagged: acc.flagged,
      });
    }
  }
  if (items.length <= maxItems) return items;
  const size = (i: GridItem<T>) => (i.kind === 'cluster' ? i.count : 1);
  return items.sort((a, b) => size(b) - size(a)).slice(0, maxItems);
}

/**
 * True se il punto cade nei bounds. Gestisce viste che attraversano
 * l'antimeridiano e mappe "srotolate" (Leaflet worldCopyJump: lon fuori ±180).
 */
export function inBounds(p: GeoPoint, b: Bounds): boolean {
  if (p.lat < b.south || p.lat > b.north) return false;
  if (b.east - b.west >= 360) return true;
  const west = ((((b.west + 180) % 360) + 360) % 360) - 180;
  const span = b.east - b.west;
  const dLon = ((((p.lon - west) % 360) + 360) % 360);
  return dLon <= span;
}

/** Allarga i bounds di una frazione per lato (evita pop-in ai bordi durante il pan). */
export function padBounds(b: Bounds, ratio: number): Bounds {
  const dLat = (b.north - b.south) * ratio;
  const dLon = (b.east - b.west) * ratio;
  return {
    south: Math.max(-90, b.south - dLat),
    north: Math.min(90, b.north + dLat),
    west: b.west - dLon,
    east: b.east + dLon,
  };
}

/** Cella in gradi (3D): ampiezza proporzionale all'altitudine della camera. */
export function globeCellDegrees(altitude: number): number {
  const a = Number.isFinite(altitude) && altitude > 0 ? altitude : 2.5;
  // Potenze di 2 → pochi valori distinti, pochi ricalcoli durante lo zoom.
  const raw = a * 4;
  const pow = Math.pow(2, Math.round(Math.log2(raw)));
  return Math.min(16, Math.max(1 / 64, pow));
}

// ─── Globo 3D ─────────────────────────────────────────────────────────────

/** Sotto questa quota (raggi terrestri, ≈ 450 km) il globo mostra le camere singole. */
export const GLOBE_NO_CLUSTER_ALTITUDE = 0.07;

/**
 * Quota minima (≈ 1.900 km) a cui le azioni CAM portano il globo. La texture
 * del globo è 2048×1024 (≈ 20 km/pixel): più vicino diventa una macchia
 * sfocata e si perde il contesto geografico. Da qui in giù si usa Explorer.
 */
export const GLOBE_CAM_MIN_ALTITUDE = 0.3;

/** Quota a cui il globo centra una camera scelta da CAM Explorer. */
export function globeFocusAltitude(currentAltitude: number): number {
  const cur = Number.isFinite(currentAltitude) && currentAltitude > 0 ? currentAltitude : 2.5;
  return Math.max(GLOBE_CAM_MIN_ALTITUDE, Math.min(cur, 0.5));
}

/** True se il globo è già (circa) alla quota minima CAM: un cluster apre Explorer. */
export function isAtGlobeCamFloor(altitude: number): boolean {
  return altitude <= GLOBE_CAM_MIN_ALTITUDE * 1.15;
}

/**
 * Quota della camera quantizzata a passi di √2: i marker CAM vengono
 * ricalcolati solo quando la quota cambia davvero, non a ogni frame.
 */
export function quantizeGlobeAltitude(altitude: number): number {
  const a = Number.isFinite(altitude) && altitude > 0 ? altitude : 2.5;
  return Math.pow(2, Math.round(Math.log2(a) * 2) / 2);
}

/**
 * Raggio (gradi) del punto di una camera singola, proporzionale alla quota:
 * a schermo resta un pallino di dimensione quasi costante.
 */
export function globeSingleRadiusDeg(altitude: number): number {
  return Math.min(0.3, Math.max(0.002, altitude * 0.35));
}

/**
 * Quota a cui portare la camera dopo il click su un cluster: abbastanza vicina
 * da separarne i membri (cella ≈ metà dell'estensione), sempre più vicina
 * della quota attuale e mai sotto la quota minima leggibile.
 */
export function globeClusterZoomAltitude(bounds: Bounds, currentAltitude: number): number {
  const midLat = ((bounds.north + bounds.south) / 2) * (Math.PI / 180);
  const spanDeg = Math.max(bounds.north - bounds.south, (bounds.east - bounds.west) * Math.cos(midLat));
  const cur = Number.isFinite(currentAltitude) && currentAltitude > 0 ? currentAltitude : 2.5;
  return Math.max(GLOBE_CAM_MIN_ALTITUDE, Math.min(cur / 2, spanDeg / 4));
}

/** I `max` punti più vicini a (lat, lon) — distanza equirettangolare, O(n log n). */
export function nearestPoints<T extends GeoPoint>(points: readonly T[], lat: number, lon: number, max: number): T[] {
  if (points.length <= max) return [...points];
  const k = Math.cos(lat * (Math.PI / 180));
  const d = (p: T) => {
    const dLat = p.lat - lat;
    let dLon = Math.abs(p.lon - lon) % 360;
    if (dLon > 180) dLon = 360 - dLon;
    return dLat * dLat + dLon * k * (dLon * k);
  };
  return points
    .map((p) => ({ p, d: d(p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.p);
}
