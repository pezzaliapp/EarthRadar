import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useSatellites } from '@/hooks/useSatellites';
import {
  groundTrackSatrec,
  propagateSatrec,
  tleToSatrec,
  type Satrec,
} from '@/lib/sgp4Lite';
import type { SatelliteRecord } from '@/services/celestrakApi';

/**
 * Overlay satelliti: marker propagati ogni 5s. Mostra SOLO i satelliti dentro la
 * bounding box corrente (perf), e per il satellite selezionato disegna anche il
 * ground track 90 min.
 */

const TICK_MS = 5_000;

const ICON_HTML =
  '<div style="font-size:18px;line-height:18px;text-shadow:0 0 8px rgba(92,240,255,0.6);">🛰️</div>';
const SELECTED_ICON_HTML =
  '<div style="font-size:22px;line-height:22px;text-shadow:0 0 12px rgba(255,92,208,0.85);">🛰️</div>';

const satIcon = L.divIcon({
  className: 'er-sat-icon',
  html: ICON_HTML,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const satIconSelected = L.divIcon({
  className: 'er-sat-icon-selected',
  html: SELECTED_ICON_HTML,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

interface DecoratedSat {
  rec: SatelliteRecord;
  satrec: Satrec;
}

export default function SatelliteLayer() {
  const enabled = useLayersStore((s) => s.overlays.satellites?.enabled ?? false);
  const groups = useLayersStore((s) => s.satelliteGroups);
  const selected = useLayersStore((s) => s.selectedSatellite);
  const setSelected = useLayersStore((s) => s.setSelectedSatellite);
  const { t } = useTranslation();
  const { records } = useSatellites(enabled ? groups : []);

  const map = useMap();
  const [tick, setTick] = useState(() => Date.now());
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => (map ? map.getBounds() : null));

  useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomend: () => setBounds(map.getBounds()),
  });

  // Tick 5s — usa setInterval (RAF è eccessivo per posizioni satellitari).
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTick(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  // Memo: parsing satrec una sola volta per record (loop frequenti senza re-parse).
  const decorated = useMemo<DecoratedSat[]>(() => {
    return records
      .map((rec) => {
        try {
          const satrec = tleToSatrec(rec.tle);
          return { rec, satrec };
        } catch {
          return null;
        }
      })
      .filter((x): x is DecoratedSat => x !== null);
  }, [records]);

  // Propaga TUTTI i satrec all'istante `tick`. Filtra a viewport in render.
  const positions = useMemo(() => {
    const now = new Date(tick);
    const out: Array<{
      sat: DecoratedSat;
      lat: number;
      lon: number;
      alt: number;
      vel: number;
    }> = [];
    for (const d of decorated) {
      const p = propagateSatrec(d.satrec, now);
      if (!p) continue;
      out.push({ sat: d, lat: p.lat, lon: p.lon, alt: p.alt, vel: p.velocityKms ?? 0 });
    }
    return out;
  }, [decorated, tick]);

  // Ground track per il satellite selezionato
  const selectedTrack = useMemo<Array<[number, number]> | null>(() => {
    if (!selected) return null;
    const d = decorated.find((x) => x.rec.noradId === selected.noradId);
    if (!d) return null;
    const samples = groundTrackSatrec(d.satrec, new Date(tick), 90, 30);
    return samples.map((p) => [p.lat, p.lon] as [number, number]);
  }, [decorated, selected, tick]);

  // ref usato solo per stabilità durante hot reload
  const lastPosCount = useRef(0);
  useEffect(() => {
    lastPosCount.current = positions.length;
  }, [positions.length]);

  if (!enabled) return null;

  const visible = bounds ? positions.filter((p) => bounds.contains([p.lat, p.lon])) : positions;

  return (
    <>
      {selectedTrack && selectedTrack.length > 1 && (
        <Polyline
          positions={selectedTrack}
          pathOptions={{
            color: '#5cf0ff',
            weight: 1.6,
            opacity: 0.75,
            dashArray: '4 4',
          }}
        />
      )}
      {visible.map((p) => {
        const isSelected = selected?.noradId === p.sat.rec.noradId;
        return (
          <Marker
            key={p.sat.rec.noradId}
            position={[p.lat, p.lon]}
            icon={isSelected ? satIconSelected : satIcon}
            eventHandlers={{
              click: () =>
                setSelected({ noradId: p.sat.rec.noradId, name: p.sat.rec.name }),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} sticky>
              <div className="text-[11px] leading-tight">
                <div className="font-semibold text-cyan-glow">{p.sat.rec.name}</div>
                <div className="font-mono">
                  {t('satellites.tooltipNorad')} {p.sat.rec.noradId} · {p.alt.toFixed(0)} km · {p.vel.toFixed(2)} km/s
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
