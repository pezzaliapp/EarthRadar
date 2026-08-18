/**
 * coords.ts — validazione difensiva delle coordinate geografiche.
 *
 * PRINCIPIO: nessuna coordinata deve essere passata a Leaflet (o ad altra
 * libreria geografica) senza prima verificare che sia FINITA e nel range
 * geografico valido. Questo elimina alla radice errori del tipo
 * "Invalid LatLng object: (NaN, NaN)" quando una sorgente (GPS, API, SGP4 con
 * TLE stale, stato persistito di una versione precedente) produce valori
 * undefined / null / stringa / NaN / fuori range.
 */

/** Fallback sicuro coerente con l'app: Reggio Emilia (omaggio al progetto). */
export const DEFAULT_CENTER: [number, number] = [44.698, 10.631];

/** true se `lat` è un numero finito in [-90, 90]. */
export function isValidLat(lat: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** true se `lon` è un numero finito in [-180, 180]. */
export function isValidLon(lon: unknown): lon is number {
  return typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

/** true se lat/lon sono entrambi validi (finiti + in range). */
export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  return isValidLat(lat) && isValidLon(lon);
}

/** true se `t` è una tupla [lat, lon] valida. */
export function isValidLatLngTuple(t: unknown): t is [number, number] {
  return Array.isArray(t) && t.length === 2 && isValidLat(t[0]) && isValidLon(t[1]);
}

/**
 * Ritorna una tupla [lat, lon] valida oppure il `fallback` se l'input non è
 * valido. Non lancia mai.
 */
export function sanitizeCenter(
  t: unknown,
  fallback: [number, number] = DEFAULT_CENTER,
): [number, number] {
  return isValidLatLngTuple(t) ? [t[0], t[1]] : fallback;
}

/** Filtra un elenco di punti [lat, lon] tenendo solo quelli validi. */
export function filterValidLatLng(points: ReadonlyArray<[number, number]>): Array<[number, number]> {
  return points.filter((p): p is [number, number] => isValidLatLngTuple(p));
}
