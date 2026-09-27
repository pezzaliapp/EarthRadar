import { describe, expect, it } from 'vitest';
import {
  AIRCRAFT_TRANSITION_MS,
  isTransitionDone,
  positionAt,
  renderAltitude,
  renderHeadingDeg,
  retarget,
  type MotionPoint,
} from './aircraftMotion';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

const base: GatewayAircraft = {
  id: 'abc123',
  icao24: 'abc123',
  callsign: null,
  registration: null,
  typeCode: null,
  lat: 45,
  lon: 9,
  onGround: false,
  altBaroM: null,
  altGeomM: null,
  groundSpeedMs: 250,
  trackDeg: null,
  verticalRateMs: null,
  squawk: null,
  emergency: null,
  positionSource: 'adsb',
  positionAgeS: 0,
  privacyRestricted: false,
};

describe('quota e rotta: nessun valore inventato', () => {
  it('quota null → ignota (nessun ripiego tipo 11 000 m)', () => {
    expect(renderAltitude(base)).toEqual({ kind: 'unknown', meters: null });
  });

  it('quota barometrica, poi geometrica', () => {
    expect(renderAltitude({ ...base, altBaroM: 10_000, altGeomM: 10_200 })).toEqual({
      kind: 'measured',
      meters: 10_000,
    });
    expect(renderAltitude({ ...base, altGeomM: 3_000 })).toEqual({
      kind: 'measured',
      meters: 3_000,
    });
  });

  it('a terra → rappresentato a terra, senza quota fittizia', () => {
    expect(renderAltitude({ ...base, onGround: true, altBaroM: null })).toEqual({
      kind: 'ground',
      meters: 0,
    });
  });

  it('rotta null → null (simbolo neutro), mai 0°', () => {
    expect(renderHeadingDeg(base)).toBeNull();
    expect(renderHeadingDeg({ ...base, trackDeg: 0 })).toBe(0);
    expect(renderHeadingDeg({ ...base, trackDeg: 255.7 })).toBe(255.7);
  });
});

describe('movimento: solo transizione grafica A → B reale', () => {
  const A: MotionPoint = { lat: 45, lon: 9, altM: 10_000 };
  const B: MotionPoint = { lat: 45.05, lon: 9.05, altM: 10_300 };

  it('prima apparizione: subito sulla posizione reale, nessuna animazione', () => {
    const t = retarget(undefined, A, 0);
    expect(positionAt(t, 0)).toEqual(A);
    expect(isTransitionDone(t, 0)).toBe(true);
  });

  it('da A verso B dopo la ricezione di B, poi esattamente B', () => {
    const t = retarget(retarget(undefined, A, 0), B, 1_000);
    expect(positionAt(t, 1_000)).toEqual(A);
    const mid = positionAt(t, 1_000 + AIRCRAFT_TRANSITION_MS / 2);
    expect(mid.lat).toBeGreaterThan(A.lat);
    expect(mid.lat).toBeLessThan(B.lat);
    expect(positionAt(t, 1_000 + AIRCRAFT_TRANSITION_MS)).toEqual(B);
  });

  it('nessuna estrapolazione: molto dopo B l’aereo resta esattamente su B', () => {
    const t = retarget(retarget(undefined, A, 0), B, 0);
    for (const later of [AIRCRAFT_TRANSITION_MS, 30_000, 120_000, 3_600_000]) {
      expect(positionAt(t, later)).toEqual(B);
    }
  });

  it('non usa velocità né rotta: il percorso dipende solo da A e B', () => {
    // retarget/positionAt non ricevono l'aereo: velocità e rotta non possono influire.
    const t = retarget(retarget(undefined, A, 0), B, 0);
    const p = positionAt(t, AIRCRAFT_TRANSITION_MS / 2);
    expect(p.lat).toBeCloseTo((A.lat + B.lat) / 2, 10);
    expect(p.lon).toBeCloseTo((A.lon + B.lon) / 2, 10);
    // Ogni punto intermedio sta sul segmento A–B, mai oltre.
    for (let f = 0; f <= 1.5; f += 0.1) {
      const q = positionAt(t, f * AIRCRAFT_TRANSITION_MS);
      expect(q.lat).toBeGreaterThanOrEqual(A.lat);
      expect(q.lat).toBeLessThanOrEqual(B.lat);
    }
  });

  it('nuovo dato durante l’animazione: riparte dalla posizione mostrata verso il nuovo punto reale', () => {
    const C: MotionPoint = { lat: 45.1, lon: 9.1, altM: 10_500 };
    const t1 = retarget(retarget(undefined, A, 0), B, 0);
    const now = AIRCRAFT_TRANSITION_MS / 2;
    const shown = positionAt(t1, now);
    const t2 = retarget(t1, C, now);
    expect(t2.from).toEqual(shown);
    expect(t2.to).toEqual(C);
    expect(positionAt(t2, now + 10 * AIRCRAFT_TRANSITION_MS)).toEqual(C);
  });

  it('quota ignota su uno dei due estremi: nessuna quota interpolata inventata', () => {
    const t = retarget(retarget(undefined, { ...A, altM: null }, 0), B, 0);
    expect(positionAt(t, AIRCRAFT_TRANSITION_MS / 2).altM).toBe(B.altM);
    const t2 = retarget(retarget(undefined, A, 0), { ...B, altM: null }, 0);
    expect(positionAt(t2, AIRCRAFT_TRANSITION_MS / 2).altM).toBeNull();
  });

  it('salto lungo (cambio area, dati discontinui) → nessuna transizione', () => {
    const far: MotionPoint = { lat: 46, lon: 9, altM: 10_000 };
    const t = retarget(retarget(undefined, A, 0), far, 0);
    expect(positionAt(t, 0)).toEqual(far);
  });

  it('antimeridiano: passa per il percorso breve', () => {
    const P: MotionPoint = { lat: 0, lon: 179.95, altM: null };
    const Q: MotionPoint = { lat: 0, lon: -179.95, altM: null };
    const t = retarget(retarget(undefined, P, 0), Q, 0);
    const mid = positionAt(t, AIRCRAFT_TRANSITION_MS / 2);
    expect(Math.abs(mid.lon)).toBeGreaterThan(179.9);
  });

  it('durata 0 (prefers-reduced-motion) → subito B', () => {
    const t = retarget(retarget(undefined, A, 0), B, 0, 0);
    expect(positionAt(t, 0)).toEqual(B);
  });
});
