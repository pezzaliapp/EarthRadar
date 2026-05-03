/**
 * Helper geometrici: distanze, bearing, proiezione lineare a breve termine.
 */
const EARTH_R_KM = 6371;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const lat1 = aLat * DEG;
  const lat2 = bLat * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLon = (bLon - aLon) * DEG;
  const lat1 = aLat * DEG;
  const lat2 = bLat * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * RAD;
  return (brng + 360) % 360;
}

/**
 * Punto a `distKm` di distanza great-circle dal centro lat/lon, lungo il
 * bearing iniziale `bearingDeg` (0 = nord, 90 = est).
 * Esatta su sfera ideale (raggio EARTH_R_KM).
 */
export function pointAtDistance(
  lat: number,
  lon: number,
  bearingDeg: number,
  distKm: number,
): { lat: number; lon: number } {
  const angDist = distKm / EARTH_R_KM;
  const phi1 = lat * DEG;
  const lam1 = lon * DEG;
  const theta = bearingDeg * DEG;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(angDist) + Math.cos(phi1) * Math.sin(angDist) * Math.cos(theta),
  );
  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angDist) * Math.cos(phi1),
      Math.cos(angDist) - Math.sin(phi1) * Math.sin(phi2),
    );
  let lonOut = lam2 * RAD;
  lonOut = ((lonOut + 540) % 360) - 180;
  return { lat: phi2 * RAD, lon: lonOut };
}

/**
 * Proietta un punto lat/lon di `seconds` secondi avanti, dato heading e velocità in m/s.
 * Wrapper di `pointAtDistance`: calcola la distanza in km dalla velocità.
 */
export function projectAhead(
  lat: number,
  lon: number,
  headingDeg: number,
  speedMs: number,
  seconds: number,
): { lat: number; lon: number } {
  const distKm = (speedMs * seconds) / 1000;
  return pointAtDistance(lat, lon, headingDeg, distKm);
}

/** Le 8 direzioni cardinali / intercardinali. Bearing 0 = N. */
export const COMPASS_8: Array<{ key: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'; bearingDeg: number }> = [
  { key: 'N', bearingDeg: 0 },
  { key: 'NE', bearingDeg: 45 },
  { key: 'E', bearingDeg: 90 },
  { key: 'SE', bearingDeg: 135 },
  { key: 'S', bearingDeg: 180 },
  { key: 'SW', bearingDeg: 225 },
  { key: 'W', bearingDeg: 270 },
  { key: 'NW', bearingDeg: 315 },
];

/**
 * Genera 8 punti distribuiti in cerchio attorno al centro a distanza `distKm`.
 * Usato dalla griglia meteo direzionale.
 */
export function compassGrid(
  centerLat: number,
  centerLon: number,
  distKm: number,
): Array<{ key: (typeof COMPASS_8)[number]['key']; bearingDeg: number; lat: number; lon: number }> {
  return COMPASS_8.map((c) => {
    const p = pointAtDistance(centerLat, centerLon, c.bearingDeg, distKm);
    return { ...c, lat: p.lat, lon: p.lon };
  });
}
