import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  aircraftSymbolScale,
  createAircraftObject,
  globeAltitudeRatio,
  globeCartesian,
  surfaceEuler,
  updateAircraftObject,
  type AircraftGlobeState,
} from './aircraftGlobeObject';

const R = 100;

function state(p: Partial<AircraftGlobeState> = {}): AircraftGlobeState {
  return {
    lat: 45,
    lon: 10,
    altM: 10_000,
    altitudeKind: 'measured',
    headingDeg: 90,
    selected: false,
    ...p,
  };
}

/** Direzione del muso (+Y locale del mesh "plane") in coordinate del globo. */
function noseDirection(obj: THREE.Object3D): THREE.Vector3 {
  const plane = obj.getObjectByName('plane') as THREE.Object3D;
  obj.updateMatrixWorld(true);
  return new THREE.Vector3(0, 1, 0).transformDirection(plane.matrixWorld);
}

function localNorthEast(lat: number, lon: number) {
  const p = new THREE.Vector3(...Object.values(globeCartesian(lat, lon, 0, R)));
  const pn = new THREE.Vector3(...Object.values(globeCartesian(lat + 0.01, lon, 0, R)));
  const pe = new THREE.Vector3(...Object.values(globeCartesian(lat, lon + 0.01, 0, R)));
  return {
    up: p.clone().normalize(),
    north: pn.sub(p).normalize(),
    east: pe.sub(p).normalize(),
  };
}

describe('simbolo aereo 3D — orientamento sulla rotta reale', () => {
  it.each([
    [45, 10],
    [0, 0],
    [-33.9, 151.2],
    [60, -120],
  ])('a lat %s lon %s: +Z locale = verticale, +Y = nord', (lat, lon) => {
    const q = new THREE.Quaternion().setFromEuler(surfaceEuler(lat, lon));
    const { up, north } = localNorthEast(lat, lon);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).dot(up)).toBeCloseTo(1, 5);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(north)).toBeCloseTo(1, 3);
  });

  it.each([
    [0, 'north'],
    [90, 'east'],
    [180, 'south'],
    [270, 'west'],
  ] as const)('rotta %s° → muso verso %s', (heading, dir) => {
    const obj = createAircraftObject();
    updateAircraftObject(obj, state({ headingDeg: heading }), R);
    const { north, east } = localNorthEast(45, 10);
    const expected = { north, east, south: north.clone().negate(), west: east.clone().negate() }[
      dir
    ];
    expect(noseDirection(obj).dot(expected)).toBeCloseTo(1, 3);
  });

  it('rotta null → simbolo neutro, nessuna direzione', () => {
    const obj = createAircraftObject();
    updateAircraftObject(obj, state({ headingDeg: null }), R);
    expect(obj.getObjectByName('plane')?.visible).toBe(false);
    expect(obj.getObjectByName('neutral')?.visible).toBe(true);
  });

  it('rotta nota → aereo visibile, anello nascosto', () => {
    const obj = createAircraftObject();
    updateAircraftObject(obj, state({ headingDeg: 12 }), R);
    expect(obj.getObjectByName('plane')?.visible).toBe(true);
    expect(obj.getObjectByName('neutral')?.visible).toBe(false);
  });
});

describe('simbolo aereo 3D — quota', () => {
  it('quota reale in scala', () => {
    expect(globeAltitudeRatio({ altM: 10_000, altitudeKind: 'measured' })).toBeCloseTo(
      10_000 / 6_371_000,
      8,
    );
  });

  it('quota ignota o a terra → solo sollevamento grafico minimo, mai 11 000 m', () => {
    const unknown = globeAltitudeRatio({ altM: null, altitudeKind: 'unknown' });
    const ground = globeAltitudeRatio({ altM: 0, altitudeKind: 'ground' });
    expect(unknown).toBe(ground);
    expect(unknown * 6_371_000).toBeLessThan(2_000);
    expect(unknown).toBeLessThan(11_000 / 6_371_000);
  });

  it('posizionato alla quota reale sopra il punto reale', () => {
    const obj = createAircraftObject();
    updateAircraftObject(obj, state({ lat: 44.54, lon: 10.77, altM: 5304 }), R);
    const expected = globeCartesian(44.54, 10.77, 5304 / 6_371_000, R);
    expect(obj.position.x).toBeCloseTo(expected.x, 6);
    expect(obj.position.y).toBeCloseTo(expected.y, 6);
    expect(obj.position.z).toBeCloseTo(expected.z, 6);
  });
});

describe('simbolo aereo 3D — dimensione', () => {
  it('scala con la quota della camera, limitata: né enorme da vicino né invisibile', () => {
    expect(aircraftSymbolScale(2.4)).toBe(1);
    expect(aircraftSymbolScale(0.1)).toBeCloseTo(0.35, 5);
    expect(aircraftSymbolScale(0.001)).toBe(0.05);
    expect(aircraftSymbolScale(0.2)).toBeGreaterThan(aircraftSymbolScale(0.1));
  });

  it('la scala non sposta l’aereo dalla posizione reale', () => {
    const a = createAircraftObject();
    const b = createAircraftObject();
    updateAircraftObject(a, state(), R, 1);
    updateAircraftObject(b, state(), R, 0.2);
    expect(b.position.equals(a.position)).toBe(true);
    expect(b.scale.x).toBe(0.2);
  });
});
