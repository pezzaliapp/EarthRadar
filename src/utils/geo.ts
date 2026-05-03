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
 * Proietta un punto lat/lon di `seconds` secondi avanti, dato heading e velocità in m/s.
 * Usa la formula great-circle (esatta su sfera). Adatta a vettori velocità di aerei
 * (≤ a qualche minuto): l'errore vs Haversine puro è < 1 m per stimoli ≤ 60 s.
 */
export function projectAhead(
  lat: number,
  lon: number,
  headingDeg: number,
  speedMs: number,
  seconds: number,
): { lat: number; lon: number } {
  const distKm = (speedMs * seconds) / 1000;
  const angDist = distKm / EARTH_R_KM; // angular distance (rad)
  const phi1 = lat * DEG;
  const lam1 = lon * DEG;
  const theta = headingDeg * DEG;
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
