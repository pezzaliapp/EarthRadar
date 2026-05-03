import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useFires } from '@/hooks/useFires';
import { frpColor, type FirmsBbox, type FirmsHotspot } from '@/services/firmsApi';

/**
 * Overlay FIRMS hotspot:
 *  - circle marker per ogni hotspot (radius scalato con FRP)
 *  - colore semaforico via `frpColor` (giallo/arancione/rosso)
 *  - tooltip con data + FRP + confidence + day/night
 *  - click → setSelectedFireId nel store
 *  - cap a 500 hotspot per viewport (debug print quando si tronca)
 *
 * Inattivo se la map key manca (la modalità fallback-gibs è gestita in
 * `GibsFiresOverlay`).
 */

const VIEWPORT_CAP = 500;

function uidOf(h: FirmsHotspot): string {
  return `${h.lat.toFixed(4)},${h.lon.toFixed(4)},${h.acqDate},${h.acqTime}`;
}

function radiusForFrp(frp: number): number {
  if (!Number.isFinite(frp)) return 4;
  if (frp < 50) return 4;
  if (frp <= 200) return 6;
  return 8;
}

export default function FireLayer() {
  const enabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.firms?.opacity ?? 1);
  const source = useLayersStore((s) => s.firesSource);
  const dayRange = useLayersStore((s) => s.firesDayRange);
  const selectedId = useLayersStore((s) => s.selectedFireId);
  const setSelectedId = useLayersStore((s) => s.setSelectedFireId);
  const { t } = useTranslation();

  const map = useMap();
  const [bbox, setBbox] = useState<FirmsBbox | null>(() => bboxOfMap(map));

  useEffect(() => {
    setBbox(bboxOfMap(map));
  }, [map]);

  useMapEvents({
    moveend: () => setBbox(bboxOfMap(map)),
    zoomend: () => setBbox(bboxOfMap(map)),
  });

  const { hotspots, mode, missingKey } = useFires(enabled, { bbox, source, dayRange });

  // Cap a 500 elementi più "intensi" (FRP) quando il viewport è popolato.
  const visible = useMemo(() => {
    if (hotspots.length <= VIEWPORT_CAP) return hotspots;
    return [...hotspots].sort((a, b) => b.frp - a.frp).slice(0, VIEWPORT_CAP);
  }, [hotspots]);

  if (!enabled) return null;
  // Se la key manca o siamo in fallback, FireLayer non disegna (ci pensa GibsFiresOverlay).
  if (missingKey || mode !== 'firms') return null;

  return (
    <>
      {visible.map((h) => {
        const id = uidOf(h);
        const isSelected = selectedId === id;
        const color = frpColor(h.frp);
        const radius = radiusForFrp(h.frp) + (isSelected ? 2 : 0);
        return (
          <CircleMarker
            key={id}
            center={[h.lat, h.lon]}
            radius={radius}
            pathOptions={{
              color: isSelected ? '#ff5cd0' : color,
              weight: isSelected ? 2.4 : 1.4,
              opacity,
              fillColor: color,
              fillOpacity: opacity * (h.frp > 200 ? 0.55 : h.frp > 50 ? 0.4 : 0.3),
            }}
            eventHandlers={{ click: () => setSelectedId(id) }}
          >
            <Tooltip direction="top" sticky>
              <div className="text-[11px] leading-tight">
                <div className="font-semibold" style={{ color }}>
                  🔥 {t('fires.frp')} {h.frp.toFixed(0)} MW
                </div>
                <div className="font-mono text-space-200">
                  {h.acqDate} {formatAcqTime(h.acqTime)} UTC · {h.dayNight === 'D' ? '☀' : '🌑'} ·{' '}
                  {h.instrument}/{h.satellite}
                </div>
                <div className="font-mono text-space-300">
                  {t('fires.confidence')}: {h.confidence}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

function bboxOfMap(map: L.Map | null): FirmsBbox | null {
  if (!map) return null;
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

function formatAcqTime(time: string): string {
  if (!time || time.length < 3) return time;
  const padded = time.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}
