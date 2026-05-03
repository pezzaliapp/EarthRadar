/**
 * Distanza great-circle in km tra due punti (lat, lon) in gradi.
 * Implementa la formula di Haversine.
 */
const EARTH_R_KM = 6371;
const DEG = Math.PI / 180;

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
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}
