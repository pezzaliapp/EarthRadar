import { describe, expect, it } from 'vitest';
import type { ReplayHistory } from './aircraftReplay';
import { REPLAY_STORAGE_KEY, loadReplay, restorableFor, saveReplay } from './aircraftReplayStorage';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

const T0 = 1_790_526_000_000;
const AREA = { lat: 44.5, lon: 10.5, radiusNm: 150 };
const history: ReplayHistory = {
  area: AREA,
  lastFetchedAt: T0,
  tracks: new Map([['a1', [{ t: T0 - 200, lat: 45, lon: 10, altM: 10_000 }]]]),
};

describe('sessionStorage del replay', () => {
  it('salva e rilegge una storia valida', () => {
    const s = memoryStorage();
    saveReplay(history, T0, s);
    const back = loadReplay(T0 + 60_000, s);
    expect(back?.area).toEqual(AREA);
    expect(back?.tracks.get('a1')).toEqual([{ t: T0 - 200, lat: 45, lon: 10, altM: 10_000 }]);
  });

  it('più vecchia di 150 s → scartata e rimossa', () => {
    const s = memoryStorage();
    saveReplay(history, T0, s);
    expect(loadReplay(T0 + 150_001, s)).toBeNull();
    expect(s.raw.has(REPLAY_STORAGE_KEY)).toBe(false);
  });

  it('dati corrotti o assenti → null, nessuna eccezione', () => {
    const s = memoryStorage();
    expect(loadReplay(T0, s)).toBeNull();
    s.setItem(REPLAY_STORAGE_KEY, '{nope');
    expect(loadReplay(T0, s)).toBeNull();
    s.setItem(REPLAY_STORAGE_KEY, JSON.stringify({ v: 2 }));
    expect(loadReplay(T0, s)).toBeNull();
    expect(loadReplay(T0, null)).toBeNull();
  });

  it('osservazioni malformate scartate una per una', () => {
    const s = memoryStorage();
    s.setItem(
      REPLAY_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        savedAt: T0,
        area: AREA,
        lastFetchedAt: T0,
        tracks: [
          ['ok', [{ t: T0, lat: 45, lon: 10, altM: null }]],
          ['ko', [{ t: 'x', lat: 45, lon: 10, altM: null }]],
        ],
      }),
    );
    const back = loadReplay(T0, s);
    expect([...(back?.tracks.keys() ?? [])]).toEqual(['ok']);
  });

  it('storage che lancia eccezioni (privacy/quota) → ignorato', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    expect(() => saveReplay(history, T0, throwing)).not.toThrow();
    expect(loadReplay(T0, throwing)).toBeNull();
  });
});

describe('restorableFor — solo come passato di una fotografia reale compatibile', () => {
  it('stessa area e ≤ 150 s → utilizzabile', () => {
    expect(restorableFor(history, { area: AREA, fetchedAt: T0 + 32_000 })).toBe(history);
  });

  it('area incompatibile → scartata', () => {
    expect(
      restorableFor(history, {
        area: { lat: 42, lon: 12.5, radiusNm: 150 },
        fetchedAt: T0 + 32_000,
      }),
    ).toBeNull();
    expect(
      restorableFor(history, { area: { ...AREA, radiusNm: 100 }, fetchedAt: T0 + 32_000 }),
    ).toBeNull();
  });

  it('scaduta rispetto alla fotografia reale → scartata', () => {
    expect(restorableFor(history, { area: AREA, fetchedAt: T0 + 150_001 })).toBeNull();
  });

  it('più recente della fotografia reale (orologi incoerenti) → scartata', () => {
    expect(restorableFor(history, { area: AREA, fetchedAt: T0 - 1 })).toBeNull();
  });
});
