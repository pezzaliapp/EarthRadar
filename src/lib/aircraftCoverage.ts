import { pointAtDistance } from '@/utils/geo';

/**
 * Area realmente interrogata dal traffico aereo: un cerchio di raggio
 * `radiusNm` attorno al centro della richiesta (quello quantizzato dal
 * gateway, restituito in `snapshot.area`). Serve a rendere visibile che
 * EarthRadar NON mostra il traffico mondiale.
 */

const KM_PER_NM = 1.852;

/** Anello [lat, lon] chiuso lungo il bordo dell'area interrogata. */
export function coverageRing(
  lat: number,
  lon: number,
  radiusNm: number,
  samples = 120,
): Array<[number, number]> {
  const km = radiusNm * KM_PER_NM;
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const p = pointAtDistance(lat, lon, (i / samples) * 360, km);
    ring.push([p.lat, p.lon]);
  }
  return ring;
}

/**
 * Vista "ampia" (l'area osservata è molto più grande del cerchio interrogato):
 * lì va detto chiaramente che il traffico è limitato a quel cerchio.
 * 3D: quota camera in raggi terrestri (a ~0,1 il cerchio riempie lo schermo).
 */
export const WIDE_VIEW_GLOBE_ALTITUDE = 0.35;
/** 2D: zoom Leaflet (a zoom 7 il cerchio da 150 NM riempie circa la mappa). */
export const WIDE_VIEW_MAP_ZOOM = 6;

export function isWideGlobeView(cameraAltitude: number): boolean {
  return cameraAltitude > WIDE_VIEW_GLOBE_ALTITUDE;
}

export function isWideMapView(zoom: number): boolean {
  return zoom <= WIDE_VIEW_MAP_ZOOM;
}
