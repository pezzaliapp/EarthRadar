import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { replayTimeMs, useAircraftStore } from '@/store/aircraftStore';
import { useAircraftView } from '@/hooks/useAircraftFeed';
import { aircraftTitle } from '@/lib/aircraftFormat';
import { renderAltitude, renderHeadingDeg } from '@/lib/aircraftMotion';
import { replayPosition } from '@/lib/aircraftReplay';
import { isWideMapView } from '@/lib/aircraftCoverage';
import { haversineKm } from '@/utils/geo';
import { isValidLatLon } from '@/utils/coords';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Overlay aerei 2D (Leaflet), dati dallo store condiviso del gateway:
 *  - marker ✈️ ruotato sulla rotta reale; rotta assente → simbolo neutro
 *  - posizione = replay differito fra due osservazioni reali (mai oltre
 *    l'ultima), aggiornato una volta al secondo
 *  - cerchio discreto dell'area realmente interrogata (150 NM)
 *  - viewport filter via map.getBounds(), cap ai 500 più vicini al centro
 */

const VIEWPORT_CAP = 500;
const REPLAY_TICK_MS = 1_000;
const KM_PER_NM = 1.852;

interface PlaneIconOpts {
  headingDeg: number | null;
  selected: boolean;
  onGround: boolean;
}

/** Icone condivise: una per combinazione, non una nuova a ogni render. */
const iconCache = new Map<string, L.DivIcon>();

/** Icona SVG: aereo ruotato se la rotta è nota, altrimenti anello senza verso. */
function makePlaneIcon({ headingDeg, selected, onGround }: PlaneIconOpts): L.DivIcon {
  const rounded = headingDeg === null ? null : Math.round(headingDeg);
  const key = `${rounded}|${selected}|${onGround}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const color = onGround ? '#9aa3c9' : selected ? '#ff5cd0' : '#5cf0ff';
  const glow = selected ? '0 0 14px rgba(255,92,208,0.85)' : '0 0 8px rgba(92,240,255,0.55)';
  const shape =
    rounded === null
      ? `<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5" />`
      : `<path fill="currentColor" d="M12 2 L13.5 11 L22 13 L13.5 14 L12 22 L10.5 14 L2 13 L10.5 11 Z" />`;
  const rotate = rounded === null ? '' : `transform: rotate(${rounded}deg);`;
  const html = `
    <div style="${rotate} width:22px; height:22px; display:grid; place-items:center;">
      <svg viewBox="0 0 24 24" width="22" height="22" style="filter: drop-shadow(${glow}); color:${color}" aria-hidden>
        ${shape}
      </svg>
    </div>`;
  const icon = L.divIcon({
    className: 'er-plane-icon',
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  iconCache.set(key, icon);
  return icon;
}

/** Orologio a 1 Hz per il replay (solo con layer attivo). */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), REPLAY_TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export default function AircraftLayer() {
  const enabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const showOnGround = useLayersStore((s) => s.aircraftShowOnGround);
  const opacity = useLayersStore((s) => s.overlays.aircraft?.opacity ?? 1);
  const selected = useLayersStore((s) => s.selectedAircraft);
  const setSelected = useLayersStore((s) => s.setSelectedAircraft);
  const { t, language } = useTranslation();
  const { aircraft: data, history, snapshot } = useAircraftView();
  const now = useTick(enabled);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => (map ? map.getBounds() : null));
  const [center, setCenter] = useState<L.LatLng | null>(() => (map ? map.getCenter() : null));
  const [zoom, setZoom] = useState<number>(() => (map ? map.getZoom() : 3));

  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
      setCenter(map.getCenter());
    },
    zoomend: () => {
      setBounds(map.getBounds());
      setCenter(map.getCenter());
      setZoom(map.getZoom());
    },
  });

  // Filtro: viewport + onGround + cap (sull'ultima posizione reale)
  const visible: GatewayAircraft[] = useMemo(() => {
    if (!enabled || data.length === 0) return [];
    let filtered = (showOnGround ? data : data.filter((a) => !a.onGround)).filter((a) =>
      isValidLatLon(a.lat, a.lon),
    );
    if (bounds) {
      filtered = filtered.filter((a) => bounds.contains([a.lat, a.lon]));
    }
    if (center && filtered.length > VIEWPORT_CAP) {
      const lat = center.lat;
      const lon = center.lng;
      filtered = [...filtered]
        .sort((a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon))
        .slice(0, VIEWPORT_CAP);
    }
    return filtered;
  }, [enabled, data, showOnGround, bounds, center]);

  if (!enabled) return null;

  const replayT = reducedMotion
    ? Number.POSITIVE_INFINITY
    : (replayTimeMs(useAircraftStore.getState(), now) ?? Number.POSITIVE_INFINITY);
  const area = snapshot?.area;

  return (
    <>
      {area && (
        <Circle
          center={[area.lat, area.lon]}
          radius={area.radiusNm * KM_PER_NM * 1000}
          interactive={false}
          pathOptions={{
            color: '#5cf0ff',
            weight: 1,
            opacity: 0.35,
            dashArray: '4 6',
            fill: false,
          }}
        />
      )}
      {area &&
        isWideMapView(zoom) &&
        createPortal(
          <div className="pointer-events-none absolute left-1/2 top-2 z-[500] -translate-x-1/2 rounded-md border border-space-500/40 bg-space-900/75 px-2.5 py-1 text-center text-[11px] leading-snug text-space-200 backdrop-blur-md">
            {t('aircraft.coverage')}
            <span className="block text-[10px] text-space-300">{t('aircraft.zoomHint')}</span>
          </div>,
          map.getContainer(),
        )}
      {visible.map((a) => {
        const isSelected = selected?.id === a.id;
        const icon = makePlaneIcon({
          headingDeg: renderHeadingDeg(a),
          selected: isSelected,
          onGround: a.onGround,
        });
        const title = aircraftTitle(a, language);
        const alt = renderAltitude(a);
        const obs = history?.tracks.get(a.id);
        const p = obs ? replayPosition(obs, replayT) : null;
        return (
          <Marker
            key={a.id}
            position={p ? [p.lat, p.lon] : [a.lat, a.lon]}
            icon={icon}
            opacity={opacity}
            eventHandlers={{
              click: () => setSelected({ id: a.id, label: title }),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} sticky>
              <div className="text-[11px] leading-tight">
                <div
                  className="font-semibold"
                  style={{ color: isSelected ? '#ff5cd0' : '#5cf0ff' }}
                >
                  {title}
                  {a.typeCode && <span className="text-space-300"> · {a.typeCode}</span>}
                </div>
                <div className="font-mono text-space-200">
                  {t('aircraft.tooltipAlt')}{' '}
                  {alt.kind === 'ground'
                    ? t('aircraft.onGround')
                    : alt.meters !== null
                      ? `${(alt.meters / 1000).toFixed(1)} km`
                      : '—'}{' '}
                  · {t('aircraft.tooltipVel')}{' '}
                  {a.groundSpeedMs !== null ? `${(a.groundSpeedMs * 3.6).toFixed(0)} km/h` : '—'}
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
