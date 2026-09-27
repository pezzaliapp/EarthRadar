import * as THREE from 'three';
import { subsolarPoint } from '@/lib/dayNightTerminator';

/**
 * Velo notturno del globo 3D.
 *
 * Invece di un poligono GeoJSON emisferico (la cui triangolazione produceva
 * buchi vicino all'antimeridiano e ai poli) usiamo un guscio sferico appena
 * sopra la superficie con uno shader: ogni frammento è "notte" se la sua
 * direzione dal centro forma più di 90° con la direzione del Sole. Nessuna
 * triangolazione, nessun caso speciale per antimeridiano o poli.
 *
 * Il terminatore si aggiorna cambiando un uniform: nessun re-render React,
 * nessuna nuova geometria.
 */

/** Stesso aspetto del vecchio poligono: rgba(5,7,15,0.55). */
export const NIGHT_COLOR = '#05070f';
export const NIGHT_OPACITY = 0.55;
/** Quota del guscio (in raggi del globo), come la vecchia `polygonAltitude`. */
export const NIGHT_SHELL_ALTITUDE = 0.001;
/** Semi-ampiezza della sfumatura del terminatore (seno dell'angolo, ~0,7°). */
export const NIGHT_TWILIGHT = 0.012;
export const NIGHT_UPDATE_MS = 60_000;

/** Versore dal centro del globo verso il punto subsolare (coordinate three-globe). */
export function sunDirection(date: Date): THREE.Vector3 {
  const [lat, lon] = subsolarPoint(date);
  return geoToUnit(lat, lon);
}

/** Stessa convenzione di three-globe (`polar2Cartesian`), raggio unitario. */
export function geoToUnit(lat: number, lon: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lon) * Math.PI) / 180;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Opacità del velo in un punto: gemella in TypeScript dello shader (usata dai
 * test). 0 di giorno, `NIGHT_OPACITY` di notte, sfumata sul terminatore.
 */
export function nightShadeAlpha(point: THREE.Vector3, sun: THREE.Vector3): number {
  const d = point.clone().normalize().dot(sun);
  return NIGHT_OPACITY * (1 - smoothstep(-NIGHT_TWILIGHT, NIGHT_TWILIGHT, d));
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTwilight;
  varying vec3 vDir;
  void main() {
    float d = dot(normalize(vDir), uSunDir);
    float night = 1.0 - smoothstep(-uTwilight, uTwilight, d);
    gl_FragColor = vec4(uColor, uOpacity * night);
  }
`;

export interface NightShade {
  mesh: THREE.Mesh;
  /** Ricalcola il terminatore per l'istante dato (aggiorna solo un uniform). */
  update(date: Date): void;
  dispose(): void;
}

export function createNightShade(globeRadius: number, date: Date = new Date()): NightShade {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDirection(date) },
      uColor: { value: new THREE.Color(NIGHT_COLOR) },
      uOpacity: { value: NIGHT_OPACITY },
      uTwilight: { value: NIGHT_TWILIGHT },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
  const geometry = new THREE.SphereGeometry(globeRadius * (1 + NIGHT_SHELL_ALTITUDE), 96, 64);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'earthradar-night-shade';
  return {
    mesh,
    update(d: Date) {
      (material.uniforms.uSunDir.value as THREE.Vector3).copy(sunDirection(d));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export interface NightClockDeps {
  now?: () => Date;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/** Aggiorna il velo una volta al minuto. Restituisce la funzione di stop. */
export function startNightShadeClock(
  update: (date: Date) => void,
  deps: NightClockDeps = {},
): () => void {
  const now = deps.now ?? (() => new Date());
  const set = deps.setInterval ?? ((fn, ms) => window.setInterval(fn, ms));
  const clear = deps.clearInterval ?? ((h) => window.clearInterval(h as number));
  update(now());
  const handle = set(() => update(now()), NIGHT_UPDATE_MS);
  return () => clear(handle);
}
