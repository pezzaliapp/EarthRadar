import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_MS,
  cooldownExpired,
  findIssNotifyCandidate,
  findQuakeNotifyCandidate,
  markNotificationFired,
} from './notificationsLogic';
import type { Quake } from '@/services/usgsQuakesApi';
import type { Pass } from '@/lib/passPredictor';

const REGGIO = { lat: 44.698, lon: 10.631 };

function quake(over: Partial<Quake>): Quake {
  return {
    id: over.id ?? 'q1',
    magnitude: over.magnitude ?? 5.5,
    place: over.place ?? 'Test',
    time: over.time ?? Date.now(),
    lat: over.lat ?? 44.7,
    lon: over.lon ?? 10.7,
    depthKm: 10,
    tsunami: false,
    url: 'https://example.test',
    alert: null,
    significance: null,
    title: 'M5.5 — Test',
  };
}

function pass(over: Partial<Pass>): Pass {
  const start = over.start ?? Date.now() + 10 * 60 * 1000;
  const end = over.end ?? start + 6 * 60 * 1000;
  return {
    start,
    end,
    maxElevationDeg: over.maxElevationDeg ?? 45,
    maxElevationAzimuthDeg: 180,
    durationSec: Math.round((end - start) / 1000),
    visible: over.visible ?? true,
    magnitude: -3,
    peak: {
      t: start + 3 * 60 * 1000,
      elevationDeg: 45,
      azimuthDeg: 180,
      satAltKm: 420,
      rangeKm: 500,
      sunAltDeg: -10,
      satSunlit: true,
    },
  };
}

describe('findQuakeNotifyCandidate', () => {
  it('returns null when userLoc is missing', () => {
    expect(findQuakeNotifyCandidate([quake({ magnitude: 6 })], null)).toBeNull();
  });

  it('returns null when no quake meets the magnitude threshold', () => {
    const r = findQuakeNotifyCandidate([quake({ magnitude: 4.5 })], REGGIO);
    expect(r).toBeNull();
  });

  it('returns null when the quake is outside the radius', () => {
    const far = quake({ magnitude: 7, lat: -33.86, lon: 151.21 }); // Sydney
    expect(findQuakeNotifyCandidate([far], REGGIO)).toBeNull();
  });

  it('returns null when the quake is outside the time window', () => {
    const old = quake({
      magnitude: 7,
      lat: 44.71,
      lon: 10.65,
      time: Date.now() - 10 * 60 * 60 * 1000, // 10h ago
    });
    expect(findQuakeNotifyCandidate([old], REGGIO)).toBeNull();
  });

  it('returns the highest-magnitude eligible quake', () => {
    const small = quake({ id: 'a', magnitude: 5.1, lat: 44.71, lon: 10.65 });
    const big = quake({ id: 'b', magnitude: 6.2, lat: 44.72, lon: 10.66 });
    const r = findQuakeNotifyCandidate([small, big], REGGIO);
    expect(r?.quake.id).toBe('b');
  });

  it('reports the haversine distance', () => {
    const r = findQuakeNotifyCandidate([quake({ lat: 44.71, lon: 10.65 })], REGGIO);
    expect(r?.distanceKm).toBeGreaterThan(0);
    expect(r?.distanceKm).toBeLessThan(5);
  });
});

describe('findIssNotifyCandidate', () => {
  const NOW = 1_700_000_000_000;

  it('picks the next visible pass within the window', () => {
    const inWindow = pass({
      start: NOW + 10 * 60 * 1000,
    });
    const r = findIssNotifyCandidate([inWindow], NOW);
    expect(r?.minutesUntil).toBe(10);
  });

  it('skips non-visible passes', () => {
    const invisible = pass({
      start: NOW + 10 * 60 * 1000,
      visible: false,
    });
    expect(findIssNotifyCandidate([invisible], NOW)).toBeNull();
  });

  it('skips passes that already started', () => {
    const past = pass({ start: NOW - 60 * 1000 });
    expect(findIssNotifyCandidate([past], NOW)).toBeNull();
  });

  it('skips passes outside the window', () => {
    const farFuture = pass({
      start: NOW + 90 * 60 * 1000,
    });
    expect(findIssNotifyCandidate([farFuture], NOW, 30)).toBeNull();
  });
});

describe('cooldown persistence', () => {
  function makeStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it('cooldownExpired is true on first call', () => {
    expect(cooldownExpired('quake', Date.now(), COOLDOWN_MS, makeStorage())).toBe(true);
  });

  it('mark + cooldownExpired round-trips correctly', () => {
    const s = makeStorage();
    const t0 = 1_700_000_000_000;
    markNotificationFired('quake', t0, s);
    expect(cooldownExpired('quake', t0 + 1000, COOLDOWN_MS, s)).toBe(false);
    expect(cooldownExpired('quake', t0 + COOLDOWN_MS, COOLDOWN_MS, s)).toBe(true);
  });

  it('different categories have independent cooldowns', () => {
    const s = makeStorage();
    const t0 = 1_700_000_000_000;
    markNotificationFired('quake', t0, s);
    expect(cooldownExpired('iss', t0, COOLDOWN_MS, s)).toBe(true);
    expect(cooldownExpired('quake', t0, COOLDOWN_MS, s)).toBe(false);
  });
});
