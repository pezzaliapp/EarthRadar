import * as THREE from 'three';
import type { AltitudeKind } from '@/lib/aircraftMotion';

/**
 * Simbolo aereo per il globo 3D: geometria piatta minimale (nessun modello
 * esterno), geometrie e materiali condivisi fra tutti gli aerei.
 *
 * Sistema locale dopo l'orientamento sulla superficie (come three-globe):
 * +X est, +Y nord, +Z verso l'esterno del globo. Il muso punta a +Y, quindi
 * rotta `h` (gradi da nord, senso orario) = rotazione di −h attorno a Z.
 */

const EARTH_RADIUS_M = 6_371_000;
/**
 * Sollevamento puramente grafico per aerei a terra o con quota ignota, per
 * non compenetrare la texture del globo. NON è una quota: nel pannello la
 * quota resta "a terra" o "non disponibile".
 */
const SURFACE_LIFT_RATIO = 0.0003;

export type AircraftSymbolStyle = 'flight' | 'ground' | 'unknown-altitude' | 'selected';

export interface AircraftGlobeState {
  lat: number;
  lon: number;
  altM: number | null;
  altitudeKind: AltitudeKind;
  headingDeg: number | null;
  selected: boolean;
}

const planeGeometry = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.36); // muso
  s.lineTo(0.05, 0.12);
  s.lineTo(0.32, -0.02); // ala destra
  s.lineTo(0.32, -0.08);
  s.lineTo(0.05, -0.04);
  s.lineTo(0.04, -0.24);
  s.lineTo(0.13, -0.32); // coda destra
  s.lineTo(0, -0.28);
  s.lineTo(-0.13, -0.32); // coda sinistra
  s.lineTo(-0.04, -0.24);
  s.lineTo(-0.05, -0.04);
  s.lineTo(-0.32, -0.08); // ala sinistra
  s.lineTo(-0.32, -0.02);
  s.lineTo(-0.05, 0.12);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();

/** Rotta ignota: anello senza verso, nessuna direzione suggerita. */
const neutralGeometry = new THREE.RingGeometry(0.07, 0.13, 20);

const materials: Record<AircraftSymbolStyle, THREE.MeshBasicMaterial> = {
  flight: new THREE.MeshBasicMaterial({ color: '#5cf0ff', side: THREE.DoubleSide }),
  ground: new THREE.MeshBasicMaterial({ color: '#9aa3c9', side: THREE.DoubleSide }),
  'unknown-altitude': new THREE.MeshBasicMaterial({
    color: '#5cf0ff',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.45,
  }),
  selected: new THREE.MeshBasicMaterial({ color: '#ff5cd0', side: THREE.DoubleSide }),
};

export function symbolStyle(
  s: Pick<AircraftGlobeState, 'altitudeKind' | 'selected'>,
): AircraftSymbolStyle {
  if (s.selected) return 'selected';
  if (s.altitudeKind === 'ground') return 'ground';
  if (s.altitudeKind === 'unknown') return 'unknown-altitude';
  return 'flight';
}

/** Quota relativa al raggio del globo: reale se misurata, solo sollevamento grafico altrimenti. */
export function globeAltitudeRatio(s: Pick<AircraftGlobeState, 'altM' | 'altitudeKind'>): number {
  if (s.altitudeKind === 'measured' && s.altM !== null) {
    return Math.max(SURFACE_LIFT_RATIO, s.altM / EARTH_RADIUS_M);
  }
  return SURFACE_LIFT_RATIO;
}

/** Stessa formula di three-globe (polar2Cartesian). */
export function globeCartesian(lat: number, lon: number, altRatio: number, globeRadius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lon) * Math.PI) / 180;
  const r = globeRadius * (1 + altRatio);
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

/** Orientamento "appoggiato sulla superficie" (stessa convenzione di three-globe). */
export function surfaceEuler(lat: number, lon: number): THREE.Euler {
  return new THREE.Euler((-lat * Math.PI) / 180, (lon * Math.PI) / 180, 0, 'YXZ');
}

export function createAircraftObject(): THREE.Object3D {
  const group = new THREE.Group();
  const plane = new THREE.Mesh(planeGeometry, materials.flight);
  plane.name = 'plane';
  const neutral = new THREE.Mesh(neutralGeometry, materials.flight);
  neutral.name = 'neutral';
  group.add(plane, neutral);
  return group;
}

/**
 * Scala del simbolo in funzione della quota della camera (in raggi terrestri,
 * come `pointOfView().altitude`): dimensione a schermo circa costante, così
 * gli aerei restano leggibili da lontano e non diventano enormi da vicino.
 */
export function aircraftSymbolScale(cameraAltitude: number): number {
  return Math.min(1, Math.max(0.05, cameraAltitude * 3.5));
}

export function updateAircraftObject(
  obj: THREE.Object3D,
  s: AircraftGlobeState,
  globeRadius: number,
  scale = 1,
): void {
  const p = globeCartesian(s.lat, s.lon, globeAltitudeRatio(s), globeRadius);
  obj.position.set(p.x, p.y, p.z);
  obj.scale.setScalar(scale);
  obj.setRotationFromEuler(surfaceEuler(s.lat, s.lon));
  const material = materials[symbolStyle(s)];
  const plane = obj.getObjectByName('plane') as THREE.Mesh | undefined;
  const neutral = obj.getObjectByName('neutral') as THREE.Mesh | undefined;
  const hasHeading = s.headingDeg !== null;
  if (plane) {
    plane.visible = hasHeading;
    plane.material = material;
    if (hasHeading) plane.rotation.set(0, 0, (-(s.headingDeg as number) * Math.PI) / 180);
  }
  if (neutral) {
    neutral.visible = !hasHeading;
    neutral.material = material;
  }
}
