/**
 * Computa la polilinea del terminatore giorno/notte per una data UTC.
 * Restituisce un array di [lat, lon] campionati lungo il globo.
 * Usa il punto subsolare (declinazione + GHA del Sole) per derivare la latitudine
 * a cui l'altitudine del Sole = 0°.
 *
 * Porta da MeteorWatch — invariato. La precisione è sufficiente per l'overlay.
 */
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

interface SolarPos {
  declRad: number;
  ghaRad: number;
}

function solarPosition(date: Date): SolarPos {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  const epsilon = (23.4393 - 0.013 * t) * DEG;
  const M = ((357.5291 + 0.98560028 * (jd - 2451545.0)) % 360) * DEG;
  const L0 = ((280.4665 + 0.98564736 * (jd - 2451545.0)) % 360) * DEG;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * DEG;
  const trueLong = L0 + C;
  const declRad = Math.asin(Math.sin(epsilon) * Math.sin(trueLong));
  const gmst = ((280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360) * DEG;
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(trueLong), Math.cos(trueLong));
  const ghaRad = gmst - ra;
  return { declRad, ghaRad };
}

export function terminator(date: Date, samples = 180): Array<[number, number]> {
  const { declRad, ghaRad } = solarPosition(date);
  const subsolarLat = declRad * RAD;
  let subsolarLon = -ghaRad * RAD;
  subsolarLon = ((subsolarLon + 540) % 360) - 180;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const phiS = subsolarLat * DEG;
    const lamS = subsolarLon * DEG;
    const dist = Math.PI / 2;
    const phi = Math.asin(
      Math.sin(phiS) * Math.cos(dist) + Math.cos(phiS) * Math.sin(dist) * Math.cos(t),
    );
    const lam =
      lamS +
      Math.atan2(
        Math.sin(t) * Math.sin(dist) * Math.cos(phiS),
        Math.cos(dist) - Math.sin(phiS) * Math.sin(phi),
      );
    let lonDeg = lam * RAD;
    lonDeg = ((lonDeg + 540) % 360) - 180;
    points.push([phi * RAD, lonDeg]);
  }
  return points;
}

export function subsolarPoint(date: Date): [number, number] {
  const { declRad, ghaRad } = solarPosition(date);
  let lon = -ghaRad * RAD;
  lon = ((lon + 540) % 360) - 180;
  return [declRad * RAD, lon];
}
