import { useEffect, useMemo, useState } from 'react';
import { Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import { terminator, subsolarPoint } from '@/lib/dayNightTerminator';
import { useLayersStore } from '@/store/layersStore';
import { isValidLatLngTuple, filterValidLatLng } from '@/utils/coords';

/**
 * Overlay terminatore giorno/notte sulla mappa Leaflet.
 * Si aggiorna ogni minuto (sufficiente per uno step visibile).
 */
export default function TerminatorOverlay() {
  const enabled = useLayersStore((s) => s.overlays.terminator?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.terminator?.opacity ?? 0.6);
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 60_000));

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick(Math.floor(Date.now() / 60_000)), 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const { line, sub } = useMemo(() => {
    const ts = tick * 60_000;
    return {
      // Difensivo: non passiamo mai coordinate non valide a Leaflet.
      line: filterValidLatLng(terminator(new Date(ts))),
      sub: subsolarPoint(new Date(ts)),
    };
  }, [tick]);

  if (!enabled) return null;
  if (line.length < 2) return null;

  return (
    <>
      <Polyline
        positions={line}
        pathOptions={{
          color: '#ff5cd0',
          weight: 1.5,
          opacity,
          dashArray: '4 4',
        }}
      />
      {isValidLatLngTuple(sub) && (
      <CircleMarker
        center={sub}
        radius={6}
        pathOptions={{
          color: '#fbbf24',
          weight: 2,
          fillColor: '#fbbf24',
          fillOpacity: opacity,
        }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          ☀ subsolar point
        </Tooltip>
      </CircleMarker>
      )}
    </>
  );
}
