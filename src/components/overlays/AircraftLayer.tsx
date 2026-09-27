import { useMemo, useState } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useAircraftView } from '@/hooks/useAircraftFeed';
import { aircraftTitle } from '@/lib/aircraftFormat';
import { renderAltitude, renderHeadingDeg } from '@/lib/aircraftMotion';
import { haversineKm } from '@/utils/geo';
import { isValidLatLon } from '@/utils/coords';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Overlay aerei 2D (Leaflet), dati dallo store condiviso del gateway:
 *  - marker ✈️ ruotato sulla rotta reale; rotta assente → simbolo neutro
 *  - solo posizioni ricevute: nessun vettore/proiezione in avanti
 *  - viewport filter via map.getBounds(), cap ai 500 più vicini al centro
 *  - diff update naturale via React key={id}
 */

const VIEWPORT_CAP = 500;

interface PlaneIconOpts {
  headingDeg: number | null;
  selected: boolean;
  onGround: boolean;
}

/** Icona SVG: aereo ruotato se la rotta è nota, altrimenti anello senza verso. */
function makePlaneIcon({ headingDeg, selected, onGround }: PlaneIconOpts): L.DivIcon {
  const color = onGround ? '#9aa3c9' : selected ? '#ff5cd0' : '#5cf0ff';
  const glow = selected ? '0 0 14px rgba(255,92,208,0.85)' : '0 0 8px rgba(92,240,255,0.55)';
  const shape =
    headingDeg === null
      ? `<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5" />`
      : `<path fill="currentColor" d="M12 2 L13.5 11 L22 13 L13.5 14 L12 22 L10.5 14 L2 13 L10.5 11 Z" />`;
  const rotate = headingDeg === null ? '' : `transform: rotate(${headingDeg}deg);`;
  const html = `
    <div style="${rotate} width:22px; height:22px; display:grid; place-items:center;">
      <svg viewBox="0 0 24 24" width="22" height="22" style="filter: drop-shadow(${glow}); color:${color}" aria-hidden>
        ${shape}
      </svg>
    </div>`;
  return L.divIcon({
    className: 'er-plane-icon',
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export default function AircraftLayer() {
  const enabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const showOnGround = useLayersStore((s) => s.aircraftShowOnGround);
  const opacity = useLayersStore((s) => s.overlays.aircraft?.opacity ?? 1);
  const selected = useLayersStore((s) => s.selectedAircraft);
  const setSelected = useLayersStore((s) => s.setSelectedAircraft);
  const { t, language } = useTranslation();
  const { aircraft: data } = useAircraftView();

  const map = useMap();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(() => (map ? map.getBounds() : null));
  const [center, setCenter] = useState<L.LatLng | null>(() => (map ? map.getCenter() : null));

  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
      setCenter(map.getCenter());
    },
    zoomend: () => {
      setBounds(map.getBounds());
      setCenter(map.getCenter());
    },
  });

  // Filtro: viewport + onGround + cap
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

  return (
    <>
      {visible.map((a) => {
        const isSelected = selected?.id === a.id;
        const icon = makePlaneIcon({
          headingDeg: renderHeadingDeg(a),
          selected: isSelected,
          onGround: a.onGround,
        });
        const title = aircraftTitle(a, language);
        const alt = renderAltitude(a);
        return (
          <Marker
            key={a.id}
            position={[a.lat, a.lon]}
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
