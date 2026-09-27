import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  greatCircleAt,
  ingestSnapshot,
  observationOf,
  replayDelayMs,
  replayPosition,
  type Observation,
} from './aircraftReplay';
import type { GatewayAircraft, GatewaySnapshot } from '@/services/aircraftGatewayApi';

const AREA = { lat: 44.5, lon: 10.5, radiusNm: 150 };

function plane(
  id: string,
  lat: number,
  lon: number,
  extra: Partial<GatewayAircraft> = {},
): GatewayAircraft {
  return {
    id,
    icao24: id,
    callsign: null,
    registration: null,
    typeCode: null,
    lat,
    lon,
    onGround: false,
    altBaroM: 10_000,
    altGeomM: null,
    groundSpeedMs: 236,
    trackDeg: 90,
    verticalRateMs: null,
    squawk: null,
    emergency: null,
    positionSource: 'adsb',
    positionAgeS: 0,
    lastSeenS: 0,
    privacyRestricted: false,
    ...extra,
  };
}

function snap(fetchedAt: number, aircraft: GatewayAircraft[], area = AREA): GatewaySnapshot {
  return {
    provider: {
      id: 'p',
      name: 'P',
      url: '',
      attribution: '',
      license: { id: '', name: '', url: '' },
    },
    area,
    providerTime: fetchedAt,
    fetchedAt,
    ttlS: 30,
    aircraft,
  };
}

const T0 = 1_790_526_000_000;
const A: Observation = { t: T0, lat: 45, lon: 10, altM: 10_000 };
const B: Observation = { t: T0 + 32_000, lat: 45, lon: 10.1, altM: 10_300 };

describe('osservazioni reali', () => {
  it('istante = tempo del provider − età della posizione (seen_pos)', () => {
    const o = observationOf(plane('a', 45, 10, { positionAgeS: 2.5 }), snap(T0, []));
    expect(o).toEqual({ t: T0 - 2_500, lat: 45, lon: 10, altM: 10_000 });
  });

  it('quota ignota resta ignota, a terra resta 0', () => {
    expect(observationOf(plane('a', 45, 10, { altBaroM: null }), snap(T0, [])).altM).toBeNull();
    expect(observationOf(plane('a', 45, 10, { onGround: true }), snap(T0, [])).altM).toBe(0);
  });

  it('ingest: A poi B nella storia; stessa fotografia due volte → nessun doppione', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10)]));
    const h2 = ingestSnapshot(h1, snap(T0 + 32_000, [plane('a', 45, 10.1)]));
    expect(h2.tracks.get('a')?.map((o) => o.lon)).toEqual([10, 10.1]);
    expect(ingestSnapshot(h2, snap(T0 + 32_000, [plane('a', 45, 10.1)]))).toBe(h2);
  });

  it('aereo comparso solo in B: una sola osservazione', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10)]));
    const h2 = ingestSnapshot(
      h1,
      snap(T0 + 32_000, [plane('a', 45, 10.1), plane('nuovo', 46, 11)]),
    );
    expect(h2.tracks.get('nuovo')).toHaveLength(1);
    // Si mostra la sua unica posizione reale, ferma, a qualunque istante.
    for (const t of [T0, T0 + 16_000, T0 + 120_000]) {
      expect(replayPosition(h2.tracks.get('nuovo') ?? [], t)).toMatchObject({ lat: 46, lon: 11 });
    }
  });

  it('aereo scomparso in B: non viene più disegnato (nessuna posizione inventata)', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10), plane('via', 44, 9)]));
    const h2 = ingestSnapshot(h1, snap(T0 + 32_000, [plane('a', 45, 10.1)]));
    expect(h2.tracks.has('via')).toBe(false);
  });

  it('area diversa: la storia riparte', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10)]));
    const h2 = ingestSnapshot(
      h1,
      snap(T0 + 32_000, [plane('a', 45, 10.1)], { lat: 42, lon: 12.5, radiusNm: 150 }),
    );
    expect(h2.tracks.get('a')).toHaveLength(1);
  });

  it('al massimo 3 osservazioni per aereo', () => {
    let h = ingestSnapshot(null, snap(T0, [plane('a', 45, 10)]));
    for (let i = 1; i <= 5; i++)
      h = ingestSnapshot(h, snap(T0 + i * 32_000, [plane('a', 45, 10 + i / 10)]));
    expect(h.tracks.get('a')).toHaveLength(3);
  });
});

describe('replay differito A → B', () => {
  it('B arriva quando il replay ha già superato A: riparte da A senza balzi, arriva in B', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10, { positionAgeS: 20 })]));
    const a = h1.tracks.get('a')?.[0] as Observation; // A.t = T0 − 20 s
    const replayNow = T0 - 5_000; // replay già 15 s oltre A: aereo fermo su A
    expect(replayPosition([a], replayNow)).toMatchObject({ lat: 45, lon: 10 });
    const h2 = ingestSnapshot(h1, snap(T0 + 32_000, [plane('a', 45, 10.1)]), replayNow);
    const track = h2.tracks.get('a') ?? [];
    // Nessun balzo: all'istante corrente è ancora esattamente su A (posizione reale)…
    expect(replayPosition(track, replayNow)).toMatchObject({ lat: 45, lon: 10 });
    // …poi si muove verso B e arriva esattamente in B al suo istante reale.
    expect(replayPosition(track, replayNow + 1_000)?.lon).toBeGreaterThan(10);
    expect(replayPosition(track, T0 + 32_000)).toMatchObject({ lat: 45, lon: 10.1 });
    // Posizione di A invariata: cambia solo l'istante di partenza.
    expect(track[0]).toMatchObject({ lat: 45, lon: 10, t: replayNow });
  });

  it('senza replayNow o con replay prima di A: istanti reali invariati', () => {
    const h1 = ingestSnapshot(null, snap(T0, [plane('a', 45, 10)]));
    const h2 = ingestSnapshot(h1, snap(T0 + 32_000, [plane('a', 45, 10.1)]), T0 - 3_000);
    expect(h2.tracks.get('a')?.[0]?.t).toBe(T0);
  });

  it('ritardo del replay = ttl + 5 s', () => {
    expect(replayDelayMs(30)).toBe(35_000);
  });

  it('interpola fra A e B nell’intervallo reale fra le osservazioni', () => {
    const p0 = replayPosition([A, B], A.t);
    const pMid = replayPosition([A, B], A.t + 16_000);
    const p1 = replayPosition([A, B], B.t);
    expect(p0).toMatchObject({ lat: A.lat, lon: A.lon });
    expect(pMid?.phase).toBe('interpolated');
    expect(pMid?.lon).toBeGreaterThan(A.lon);
    expect(pMid?.lon).toBeLessThan(B.lon);
    expect(pMid?.altM).toBeCloseTo(10_150, 6);
    expect(p1).toMatchObject({ lat: B.lat, lon: B.lon, altM: B.altM });
  });

  it('movimento continuo: nessun salto fra un secondo e il successivo', () => {
    let prev = replayPosition([A, B], A.t);
    for (let t = A.t + 1_000; t <= B.t; t += 1_000) {
      const p = replayPosition([A, B], t);
      const km =
        angularDistance(prev as unknown as Observation, p as unknown as Observation) * 6371;
      expect(km).toBeLessThan(0.3); // ~250 m/s reali fra A e B
      prev = p;
    }
  });

  it('mai oltre B: dopo B resta esattamente su B, a qualunque istante', () => {
    for (const t of [B.t, B.t + 1, B.t + 30_000, B.t + 3_600_000]) {
      expect(replayPosition([A, B], t)).toEqual({
        lat: B.lat,
        lon: B.lon,
        altM: B.altM,
        phase: 'holding-last',
      });
    }
  });

  it('nessuna estrapolazione: velocità e rotta non influiscono (il replay vede solo A e B)', () => {
    // Stesse osservazioni ⇒ stesso percorso, qualunque velocità/rotta dichiarata:
    // replayPosition non riceve l'aereo, solo le osservazioni.
    const fast = observationOf(
      plane('x', 45, 10, { groundSpeedMs: 300, trackDeg: 0 }),
      snap(T0, []),
    );
    const slow = observationOf(
      plane('x', 45, 10, { groundSpeedMs: 10, trackDeg: 270 }),
      snap(T0, []),
    );
    expect(fast).toEqual(slow);
    // Ogni punto del replay sta sul segmento A–B.
    for (let f = 0; f <= 1.5; f += 0.05) {
      const p = replayPosition([A, B], A.t + f * (B.t - A.t)) as unknown as Observation;
      const d = angularDistance(A, p) + angularDistance(p, B) - angularDistance(A, B);
      expect(Math.abs(d)).toBeLessThan(1e-7); // ≈ 0,6 m: solo arrotondamento numerico
    }
  });

  it('interpolazione sul cerchio massimo, anche attraverso l’antimeridiano', () => {
    const P: Observation = { t: T0, lat: 60, lon: 179.9, altM: null };
    const Q: Observation = { t: T0 + 32_000, lat: 60, lon: -179.9, altM: null };
    const mid = replayPosition([P, Q], T0 + 16_000) as unknown as Observation;
    expect(Math.abs(mid.lon)).toBeGreaterThan(179.8);
    const gc = greatCircleAt({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 0.5);
    expect(gc.lat).toBeCloseTo(0, 9);
    expect(gc.lon).toBeCloseTo(45, 9);
  });

  it('con tre osservazioni usa il segmento giusto (A→B poi B→C)', () => {
    const C: Observation = { t: B.t + 32_000, lat: 45, lon: 10.2, altM: 10_300 };
    expect(replayPosition([A, B, C], B.t + 16_000)?.lon).toBeGreaterThan(B.lon);
    expect(replayPosition([A, B, C], C.t + 10_000)).toMatchObject({ lon: C.lon });
  });

  it('prima di A: ferma sulla prima osservazione reale', () => {
    expect(replayPosition([A, B], A.t - 10_000)).toMatchObject({
      lat: A.lat,
      lon: A.lon,
      phase: 'holding-first',
    });
  });

  it('dati discontinui (salto impossibile o intervallo lungo): nessun movimento ricostruito', () => {
    const far: Observation = { t: A.t + 32_000, lat: 47, lon: 10, altM: 10_000 }; // 222 km in 32 s
    expect(replayPosition([A, far], A.t + 16_000)).toMatchObject({ lat: A.lat, phase: 'step' });
    const late: Observation = { t: A.t + 200_000, lat: 45, lon: 10.5, altM: 10_000 };
    expect(replayPosition([A, late], A.t + 100_000)).toMatchObject({ lon: A.lon, phase: 'step' });
  });

  it('quota ignota a un estremo: nessuna quota interpolata inventata', () => {
    const b2 = { ...B, altM: null };
    expect(replayPosition([A, b2], A.t + 8_000)?.altM).toBe(A.altM);
    expect(replayPosition([A, b2], A.t + 24_000)?.altM).toBeNull();
  });
});
