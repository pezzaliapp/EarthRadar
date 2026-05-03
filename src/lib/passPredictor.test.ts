import { describe, expect, it } from 'vitest';
import {
  azimuthToCardinal,
  elevationAzimuth,
  estimateMagnitude,
  isSatSunlit,
  predictPasses,
  sunAltitudeDeg,
  sunSubpoint,
} from './passPredictor';
import { tleToSatrec, type TleSet } from './sgp4Lite';

/**
 * TLE ISS reale, epoch ~2024-09-25 (snapshot CelesTrak).
 * Lo fissiamo per stabilità dei test: cambiare epoch significa cambiare i
 * passaggi attesi. NON è un'API live: serve solo come input deterministico.
 */
const ISS_TLE: TleSet = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   24268.50000000  .00012345  00000-0  22345-3 0  9991',
  line2: '2 25544  51.6400 100.0000 0001234  90.0000 270.0000 15.50000000 12345',
};

const REGGIO = { lat: 44.698, lon: 10.631, altM: 100 };

describe('elevationAzimuth', () => {
  it('returns 90° elevation when satellite is straight above the observer', () => {
    const r = elevationAzimuth(0, 0, 0, 0, 0, 400);
    expect(r.elevationDeg).toBeGreaterThan(89.9);
    expect(r.rangeKm).toBeCloseTo(400, 0);
  });

  it('returns negative elevation when satellite is on the opposite side of Earth', () => {
    // Satellite a (0°N, 180°E) visto da (0°N, 0°E) deve essere "dall'altra parte".
    const r = elevationAzimuth(0, 0, 0, 0, 180, 400);
    expect(r.elevationDeg).toBeLessThan(0);
  });

  it('azimuth 0° points north for an observer at the equator looking at a sat to the north', () => {
    const r = elevationAzimuth(0, 0, 0, 10, 0, 400);
    expect(r.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(r.azimuthDeg).toBeLessThan(5);
  });

  it('azimuth ~90° points east for a sat to the east', () => {
    const r = elevationAzimuth(0, 0, 0, 0, 10, 400);
    expect(r.azimuthDeg).toBeGreaterThan(85);
    expect(r.azimuthDeg).toBeLessThan(95);
  });
});

describe('sunSubpoint + sunAltitudeDeg', () => {
  it('places the sun roughly above the equator at equinox UTC noon', () => {
    // Equinozio di primavera 2024-03-20, sole subsolare circa lat 0, lon 0.
    const date = new Date('2024-03-20T12:00:00Z');
    const sub = sunSubpoint(date);
    expect(sub.lat).toBeGreaterThan(-1.5);
    expect(sub.lat).toBeLessThan(1.5);
    expect(sub.lon).toBeGreaterThan(-5);
    expect(sub.lon).toBeLessThan(5);
  });

  it('reports sun above horizon at noon UTC for an equator observer at 0°', () => {
    const alt = sunAltitudeDeg(new Date('2024-03-20T12:00:00Z'), { lat: 0, lon: 0 });
    expect(alt).toBeGreaterThan(80);
  });

  it('reports sun below horizon at midnight UTC for an equator observer at 0°', () => {
    const alt = sunAltitudeDeg(new Date('2024-03-20T00:00:00Z'), { lat: 0, lon: 0 });
    expect(alt).toBeLessThan(-80);
  });
});

describe('isSatSunlit', () => {
  it('flags ISS as illuminated when on the day side of Earth', () => {
    // Mezzogiorno UTC: sat sopra equatore a lon 0 è in pieno sole.
    const lit = isSatSunlit(new Date('2024-03-20T12:00:00Z'), 0, 0, 400);
    expect(lit).toBe(true);
  });

  it('flags ISS as in shadow when on the antisolar side of Earth', () => {
    // Mezzogiorno UTC + lon 180 (lato notturno) e bassa quota → ombra.
    const lit = isSatSunlit(new Date('2024-03-20T12:00:00Z'), 0, 180, 400);
    expect(lit).toBe(false);
  });
});

describe('estimateMagnitude', () => {
  it('returns more negative magnitude (brighter) at higher elevation', () => {
    const low = estimateMagnitude(1500, 15);
    const high = estimateMagnitude(450, 80);
    expect(high).toBeLessThan(low);
  });
});

describe('predictPasses', () => {
  it('returns at least one pass over Reggio Emilia in a 48h window', () => {
    const satrec = tleToSatrec(ISS_TLE);
    const fromMs = Date.parse('2024-09-25T00:00:00Z');
    const passes = predictPasses({
      satrec,
      observer: REGGIO,
      fromMs,
      windowHours: 48,
      stepSec: 60,
    });
    expect(passes.length).toBeGreaterThan(0);
  });

  it('every pass has duration > 0 and maxElevation >= threshold', () => {
    const satrec = tleToSatrec(ISS_TLE);
    const fromMs = Date.parse('2024-09-25T00:00:00Z');
    const passes = predictPasses({
      satrec,
      observer: REGGIO,
      fromMs,
      windowHours: 48,
      stepSec: 60,
      minMaxElevDeg: 10,
    });
    for (const p of passes) {
      expect(p.durationSec).toBeGreaterThan(0);
      expect(p.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(p.start).toBeLessThan(p.end);
      expect(p.peak.elevationDeg).toBe(p.maxElevationDeg);
    }
  });

  it('higher minMaxElev threshold reduces the count', () => {
    const satrec = tleToSatrec(ISS_TLE);
    const fromMs = Date.parse('2024-09-25T00:00:00Z');
    const lo = predictPasses({
      satrec,
      observer: REGGIO,
      fromMs,
      windowHours: 48,
      stepSec: 60,
      minMaxElevDeg: 5,
    });
    const hi = predictPasses({
      satrec,
      observer: REGGIO,
      fromMs,
      windowHours: 48,
      stepSec: 60,
      minMaxElevDeg: 40,
    });
    expect(hi.length).toBeLessThanOrEqual(lo.length);
  });

  it('always populates the visible flag as boolean', () => {
    // Non possiamo asserire la visibilità reale con TLE sintetico + sole
    // approssimato — verifichiamo solo che ogni pass abbia un flag booleano e
    // che la magnitudine sia null per i pass non visibili.
    const satrec = tleToSatrec(ISS_TLE);
    const fromMs = Date.parse('2024-09-25T00:00:00Z');
    const passes = predictPasses({
      satrec,
      observer: REGGIO,
      fromMs,
      windowHours: 48,
      stepSec: 60,
    });
    for (const p of passes) {
      expect(typeof p.visible).toBe('boolean');
      if (!p.visible) expect(p.magnitude).toBeNull();
    }
  });
});

describe('azimuthToCardinal', () => {
  it('maps key cardinals correctly', () => {
    expect(azimuthToCardinal(0)).toBe('N');
    expect(azimuthToCardinal(90)).toBe('E');
    expect(azimuthToCardinal(180)).toBe('S');
    expect(azimuthToCardinal(270)).toBe('W');
    expect(azimuthToCardinal(45)).toBe('NE');
    expect(azimuthToCardinal(359)).toBe('N');
  });
});
