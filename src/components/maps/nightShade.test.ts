import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { subsolarPoint } from '@/lib/dayNightTerminator';
import {
  NIGHT_OPACITY,
  NIGHT_SHELL_ALTITUDE,
  NIGHT_UPDATE_MS,
  createNightShade,
  geoToUnit,
  nightShadeAlpha,
  startNightShadeClock,
  sunDirection,
} from './nightShade';

const alphaAt = (date: Date, lat: number, lon: number) =>
  nightShadeAlpha(geoToUnit(lat, lon), sunDirection(date));

/** Distanza angolare (gradi) fra due punti sulla sfera. */
function angularDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const d = geoToUnit(lat1, lon1).dot(geoToUnit(lat2, lon2));
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI;
}

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

afterEach(() => {
  vi.useRealTimers();
});

describe('velo notturno — posizione del terminatore', () => {
  const day = '2026-09-27';

  it('12:00 UTC: Sole sul meridiano di Greenwich (± equazione del tempo)', () => {
    const d = new Date(`${day}T12:00:00Z`);
    const [, lon] = subsolarPoint(d);
    expect(Math.abs(lon)).toBeLessThan(5);
    expect(alphaAt(d, 0, 0)).toBe(0); // giorno
    expect(alphaAt(d, 0, 180)).toBe(NIGHT_OPACITY); // notte piena
    expect(alphaAt(d, 45, 10)).toBe(0); // Europa di giorno
  });

  it('00:00 UTC: Sole sull’antimeridiano, Europa di notte', () => {
    const d = new Date(`${day}T00:00:00Z`);
    const [, lon] = subsolarPoint(d);
    expect(180 - Math.abs(lon)).toBeLessThan(5);
    expect(alphaAt(d, 0, 180)).toBe(0);
    expect(alphaAt(d, 45, 10)).toBe(NIGHT_OPACITY);
  });

  it('06:00 UTC: Sole a ~90° E (mezzogiorno in Asia), Americhe di notte', () => {
    const d = new Date(`${day}T06:00:00Z`);
    const [, lon] = subsolarPoint(d);
    expect(Math.abs(lon - 90)).toBeLessThan(5);
    expect(alphaAt(d, 0, 90)).toBe(0);
    expect(alphaAt(d, 0, -90)).toBe(NIGHT_OPACITY);
  });

  it('18:00 UTC: Sole a ~90° W (mezzogiorno nelle Americhe), Italia di notte', () => {
    const d = new Date(`${day}T18:00:00Z`);
    const [, lon] = subsolarPoint(d);
    expect(Math.abs(lon + 90)).toBeLessThan(5);
    expect(alphaAt(d, 0, -90)).toBe(0);
    expect(alphaAt(d, 0, 90)).toBe(NIGHT_OPACITY);
    expect(alphaAt(d, 44.7, 10.6)).toBe(NIGHT_OPACITY);
  });

  it('il terminatore sta esattamente a 90° dal punto subsolare', () => {
    const d = new Date(`${day}T17:25:00Z`);
    const [sLat, sLon] = subsolarPoint(d);
    // Sull'equatore, a ±90° di longitudine dal Sole: velo a metà sfumatura.
    for (const side of [-90, 90]) {
      const a = alphaAt(d, 0, wrap(sLon + side));
      expect(a).toBeGreaterThan(NIGHT_OPACITY * 0.3);
      expect(a).toBeLessThan(NIGHT_OPACITY * 0.7);
    }
    expect(Math.abs(sLat)).toBeLessThan(3);
  });
});

describe('velo notturno — nessun buco, antimeridiano, poli', () => {
  it('campionamento dell’intero globo a 1°: notte continua, giorno pulito', () => {
    for (const iso of ['2026-09-27T17:25:00Z', '2026-06-21T00:00:00Z', '2026-12-21T12:00:00Z']) {
      const d = new Date(iso);
      const [sLat, sLon] = subsolarPoint(d);
      for (let lat = -90; lat <= 90; lat += 1) {
        for (let lon = -180; lon < 180; lon += 1) {
          const dist = angularDeg(lat, lon, sLat, sLon);
          const a = alphaAt(d, lat, lon);
          if (dist > 91) expect(a).toBe(NIGHT_OPACITY); // nessun buco nell'emisfero notte
          if (dist < 89) expect(a).toBe(0); // nessuna macchia nel giorno
        }
      }
    }
  });

  it('attraversamento dell’antimeridiano: nessun salto fra 179,9° E e 179,9° W', () => {
    // 17:25 UTC: la notte copre l'antimeridiano (caso che produceva i buchi).
    const d = new Date('2026-09-27T17:25:00Z');
    for (let lat = -85; lat <= 85; lat += 5) {
      // +180° e −180° sono lo stesso punto: stesso velo, senza discontinuità.
      expect(alphaAt(d, lat, 180)).toBeCloseTo(alphaAt(d, lat, -180), 12);
      const east = alphaAt(d, lat, 179.9);
      const west = alphaAt(d, lat, -179.9);
      // 0,2° di distanza: solo il gradiente della sfumatura (~1,4°), nessun salto.
      expect(Math.abs(east - west)).toBeLessThan(0.1);
      // Declinazione −1,8°: il Polo Sud è illuminato, quindi notte piena fino a −60°.
      if (lat >= -60) expect(east).toBe(NIGHT_OPACITY);
    }
    // Continuità lungo un parallelo che attraversa l'antimeridiano (passo 0,1°):
    // a 30°N il terminatore cade proprio qui (~174,5°W).
    let prev = alphaAt(d, 30, 170);
    for (let lon = 170.1; lon <= 190; lon += 0.1) {
      const a = alphaAt(d, 30, wrap(lon));
      // Pendenza massima della sfumatura su 0,1° a 30°N ≈ 0,052; un buco o un salto
      // varrebbe 0,55 (l'intera opacità).
      expect(Math.abs(a - prev)).toBeLessThan(0.08);
      prev = a;
    }
  });

  it('solstizio di giugno: Polo Nord sempre di giorno, Polo Sud sempre di notte', () => {
    for (const h of ['00', '06', '12', '18']) {
      const d = new Date(`2026-06-21T${h}:00:00Z`);
      expect(subsolarPoint(d)[0]).toBeGreaterThan(23);
      expect(alphaAt(d, 90, 0)).toBe(0);
      expect(alphaAt(d, 80, 123)).toBe(0);
      expect(alphaAt(d, -90, 0)).toBe(NIGHT_OPACITY);
      expect(alphaAt(d, -80, -45)).toBe(NIGHT_OPACITY);
    }
  });

  it('solstizio di dicembre: Polo Nord sempre di notte, Polo Sud sempre di giorno', () => {
    for (const h of ['00', '06', '12', '18']) {
      const d = new Date(`2026-12-21T${h}:00:00Z`);
      expect(subsolarPoint(d)[0]).toBeLessThan(-23);
      expect(alphaAt(d, 90, 0)).toBe(NIGHT_OPACITY);
      expect(alphaAt(d, 80, 123)).toBe(NIGHT_OPACITY);
      expect(alphaAt(d, -90, 0)).toBe(0);
    }
  });

  it('equinozio: i poli stanno sul terminatore, giorno e notte divisi a metà', () => {
    const d = new Date('2026-03-20T14:46:00Z');
    expect(Math.abs(subsolarPoint(d)[0])).toBeLessThan(0.1);
    for (const lat of [90, -90]) {
      const a = alphaAt(d, lat, 0);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(NIGHT_OPACITY);
    }
    let night = 0;
    for (let lon = -180; lon < 180; lon += 1) if (alphaAt(d, 0, lon) === NIGHT_OPACITY) night += 1;
    expect(night).toBeGreaterThanOrEqual(178);
    expect(night).toBeLessThanOrEqual(180);
  });
});

describe('velo notturno — mesh e aggiornamento', () => {
  it('guscio sferico continuo appena sopra la superficie, velo semitrasparente', () => {
    const shade = createNightShade(100, new Date('2026-09-27T12:00:00Z'));
    const geom = shade.mesh.geometry as THREE.SphereGeometry;
    expect(geom).toBeInstanceOf(THREE.SphereGeometry);
    expect(geom.parameters.radius).toBeCloseTo(100 * (1 + NIGHT_SHELL_ALTITUDE), 10);
    const mat = shade.mesh.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.uniforms.uOpacity?.value).toBe(0.55);
    shade.dispose();
  });

  it('dopo 60 s il terminatore viene ricalcolato (solo l’uniform, stessa mesh)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T17:25:00Z'));
    const shade = createNightShade(100);
    const mesh = shade.mesh;
    const uniform = (mesh.material as THREE.ShaderMaterial).uniforms.uSunDir
      ?.value as THREE.Vector3;
    const stop = startNightShadeClock(shade.update);
    const before = uniform.clone();

    vi.advanceTimersByTime(NIGHT_UPDATE_MS - 1);
    expect(uniform.equals(before)).toBe(true);
    vi.advanceTimersByTime(1);
    const after = uniform.clone();
    expect(after.equals(before)).toBe(false);
    // Il Sole si sposta verso ovest di ~0,25° al minuto.
    const deg = (Math.acos(Math.min(1, after.dot(before))) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(0.2);
    expect(deg).toBeLessThan(0.3);
    expect(shade.mesh).toBe(mesh); // nessuna nuova geometria

    vi.advanceTimersByTime(NIGHT_UPDATE_MS * 3);
    expect(uniform.equals(after)).toBe(false);
    stop();
    const stopped = uniform.clone();
    vi.advanceTimersByTime(NIGHT_UPDATE_MS * 5);
    expect(uniform.equals(stopped)).toBe(true);
    shade.dispose();
  });
});
