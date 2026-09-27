import { useEffect, useRef, useState } from 'react';
import {
  AIRCRAFT_TRANSITION_MS,
  isTransitionDone,
  positionAt,
  renderAltitude,
  renderHeadingDeg,
  retarget,
  type MotionTrack,
} from '@/lib/aircraftMotion';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';
import type { AircraftGlobeState } from './aircraftGlobeObject';

export interface AircraftGlobeEntity extends AircraftGlobeState {
  id: string;
  aircraft: GatewayAircraft;
  track: MotionTrack;
}

/** Aggiornamenti React durante una transizione (~20 fps, solo per ~1,5 s). */
const FRAME_MS = 50;

/**
 * Entità del globo per gli aerei, con identità stabile per `id` (così
 * three-globe riusa gli oggetti THREE invece di ricrearli).
 *
 * A ogni nuova fotografia reale: transizione grafica dalla posizione
 * mostrata ora alla nuova posizione reale B, poi fermo su B fino al dato
 * successivo. Nessuna posizione calcolata oltre B.
 */
export function useAircraftGlobeEntities(
  aircraft: readonly GatewayAircraft[],
  selectedId: string | null,
  reducedMotion: boolean,
): AircraftGlobeEntity[] {
  const byId = useRef(new Map<string, AircraftGlobeEntity>());
  const [entities, setEntities] = useState<AircraftGlobeEntity[]>([]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    const now = performance.now();
    const next = new Map<string, AircraftGlobeEntity>();
    for (const a of aircraft) {
      const alt = renderAltitude(a);
      const prev = byId.current.get(a.id);
      const track = retarget(
        prev?.track,
        { lat: a.lat, lon: a.lon, altM: alt.meters },
        now,
        reducedMotion ? 0 : AIRCRAFT_TRANSITION_MS,
      );
      const p = positionAt(track, now);
      const e = prev ?? ({} as AircraftGlobeEntity);
      Object.assign(e, {
        id: a.id,
        aircraft: a,
        track,
        lat: p.lat,
        lon: p.lon,
        altM: p.altM,
        altitudeKind: alt.kind,
        headingDeg: renderHeadingDeg(a),
        selected: a.id === selectedRef.current,
      });
      next.set(a.id, e);
    }
    byId.current = next;
    setEntities([...next.values()]);

    let raf = 0;
    let lastPush = now;
    const step = () => {
      const t = performance.now();
      let active = false;
      for (const e of next.values()) {
        const p = positionAt(e.track, t);
        e.lat = p.lat;
        e.lon = p.lon;
        e.altM = p.altM;
        if (!isTransitionDone(e.track, t)) active = true;
      }
      if (!active || t - lastPush >= FRAME_MS) {
        lastPush = t;
        setEntities([...next.values()]);
      }
      if (active) raf = requestAnimationFrame(step);
    };
    if ([...next.values()].some((e) => !isTransitionDone(e.track, now))) {
      raf = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(raf);
  }, [aircraft, reducedMotion]);

  useEffect(() => {
    for (const e of byId.current.values()) e.selected = e.id === selectedId;
    setEntities([...byId.current.values()]);
  }, [selectedId]);

  return entities;
}
