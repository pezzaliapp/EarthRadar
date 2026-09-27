import { useEffect, useRef, useState } from 'react';
import { renderAltitude, renderHeadingDeg } from '@/lib/aircraftMotion';
import { replayPosition, type ReplayHistory } from '@/lib/aircraftReplay';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';
import { replayTimeMs, useAircraftStore } from '@/store/aircraftStore';
import type { AircraftGlobeState } from './aircraftGlobeObject';

export interface AircraftGlobeEntity extends AircraftGlobeState {
  id: string;
  aircraft: GatewayAircraft;
}

/** Aggiornamenti del replay sul globo (4 al secondo, solo se qualcosa si muove). */
const FRAME_MS = 250;

/**
 * Entità del globo per gli aerei, con identità stabile per `id` (three-globe
 * riusa gli oggetti THREE). La posizione è quella del REPLAY DIFFERITO:
 * interpolata fra due osservazioni reali consecutive, mai oltre l'ultima
 * (vedi `aircraftReplay.ts`). Con prefers-reduced-motion: ultima posizione
 * reale, ferma.
 */
export function useAircraftGlobeEntities(
  aircraft: readonly GatewayAircraft[],
  history: ReplayHistory | null,
  selectedId: string | null,
  reducedMotion: boolean,
): AircraftGlobeEntity[] {
  const byId = useRef(new Map<string, AircraftGlobeEntity>());
  const [entities, setEntities] = useState<AircraftGlobeEntity[]>([]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const next = new Map<string, AircraftGlobeEntity>();
    for (const a of aircraft) {
      const e = byId.current.get(a.id) ?? ({} as AircraftGlobeEntity);
      Object.assign(e, {
        id: a.id,
        aircraft: a,
        lat: a.lat,
        lon: a.lon,
        altM: renderAltitude(a).meters,
        altitudeKind: renderAltitude(a).kind,
        headingDeg: renderHeadingDeg(a),
        selected: a.id === selectedRef.current,
      });
      next.set(a.id, e);
    }
    byId.current = next;

    let first = true;
    const tick = () => {
      const t = reducedMotion
        ? Number.POSITIVE_INFINITY
        : (replayTimeMs(useAircraftStore.getState(), Date.now()) ?? Number.POSITIVE_INFINITY);
      let changed = false;
      for (const e of next.values()) {
        const obs = history?.tracks.get(e.id);
        const p = obs ? replayPosition(obs, t) : null;
        if (!p) continue;
        if (e.lat !== p.lat || e.lon !== p.lon || e.altM !== p.altM) changed = true;
        e.lat = p.lat;
        e.lon = p.lon;
        e.altM = p.altM;
      }
      // Nessun re-render se nulla si è mosso (tutti fermi sull'ultima osservazione).
      if (first || changed) setEntities([...next.values()]);
      first = false;
    };
    tick();
    const id = window.setInterval(tick, FRAME_MS);
    return () => window.clearInterval(id);
  }, [aircraft, history, reducedMotion]);

  useEffect(() => {
    for (const e of byId.current.values()) e.selected = e.id === selectedId;
    setEntities([...byId.current.values()]);
  }, [selectedId]);

  return entities;
}
