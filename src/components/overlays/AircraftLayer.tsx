import { useMemo, useState } from 'react';
import { Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useAircraft } from '@/hooks/useAircraft';
import { haversineKm, projectAhead } from '@/utils/geo';
import type { Aircraft } from '@/services/openSkyApi';

/**
 * Overlay aerei OpenSky:
 *  - marker ✈️ (divIcon SVG) ruotato sul track reale
 *  - vettore velocità: polyline 30s di proiezione lineare
 *  - viewport filter via map.getBounds()
 *  - cap a 500 aerei più vicini al centro mappa quando il viewport è popolato
 *  - diff update naturale via React key={icao24}
 */

const VIEWPORT_CAP = 500;
const VECTOR_SECONDS = 30;

interface PlaneIconOpts {
  headingDeg: number;
  selected: boolean;
  onGround: boolean;
}

/** Icon SVG ruotata. Manteniamo HTML inline per evitare un dep. */
function makePlaneIcon({ headingDeg, selected, onGround }: PlaneIconOpts): L.DivIcon {
  const color = onGround ? '#9aa3c9' : selected ? '#ff5cd0' : '#5cf0ff';
  const glow = selected ? '0 0 14px rgba(255,92,208,0.85)' : '0 0 8px rgba(92,240,255,0.55)';
  const html = `
    <div style="transform: rotate(${headingDeg}deg); width:22px; height:22px; display:grid; place-items:center;">
      <svg viewBox="0 0 24 24" width="22" height="22" style="filter: drop-shadow(${glow}); color:${color}" aria-hidden>
        <path fill="currentColor" d="M12 2 L13.5 11 L22 13 L13.5 14 L12 22 L10.5 14 L2 13 L10.5 11 Z" />
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
  const showVectors = useLayersStore((s) => s.aircraftShowVelocityVectors);
  const opacity = useLayersStore((s) => s.overlays.aircraft?.opacity ?? 1);
  const selected = useLayersStore((s) => s.selectedAircraft);
  const setSelected = useLayersStore((s) => s.setSelectedAircraft);
  const { t } = useTranslation();
  const { data } = useAircraft(enabled);

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
  const visible: Aircraft[] = useMemo(() => {
    if (!enabled || data.length === 0) return [];
    let filtered = showOnGround ? data : data.filter((a) => !a.onGround);
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
        const heading = a.headingDeg ?? 0;
        const isSelected = selected?.icao24 === a.icao24;
        const icon = makePlaneIcon({ headingDeg: heading, selected: isSelected, onGround: a.onGround });
        return (
          <Marker
            key={a.icao24}
            position={[a.lat, a.lon]}
            icon={icon}
            opacity={opacity}
            eventHandlers={{
              click: () => setSelected({ icao24: a.icao24, callsign: a.callsign }),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} sticky>
              <div className="text-[11px] leading-tight">
                <div className="font-semibold" style={{ color: isSelected ? '#ff5cd0' : '#5cf0ff' }}>
                  {a.callsign || a.icao24} <span className="text-space-300">· {a.originCountry}</span>
                </div>
                <div className="font-mono text-space-200">
                  {t('aircraft.tooltipAlt')} {a.baroAltM ? `${(a.baroAltM / 1000).toFixed(1)} km` : '—'} ·{' '}
                  {t('aircraft.tooltipVel')} {a.velocityMs ? `${(a.velocityMs * 3.6).toFixed(0)} km/h` : '—'}
                </div>
              </div>
            </Tooltip>
            {showVectors && a.velocityMs && a.velocityMs > 0 && a.headingDeg !== null && !a.onGround && (
              <VelocityVector aircraft={a} />
            )}
          </Marker>
        );
      })}
    </>
  );
}

function VelocityVector({ aircraft }: { aircraft: Aircraft }) {
  if (aircraft.velocityMs === null || aircraft.headingDeg === null) return null;
  const proj = projectAhead(
    aircraft.lat,
    aircraft.lon,
    aircraft.headingDeg,
    aircraft.velocityMs,
    VECTOR_SECONDS,
  );
  return (
    <Polyline
      positions={[
        [aircraft.lat, aircraft.lon],
        [proj.lat, proj.lon],
      ]}
      pathOptions={{
        color: '#5cf0ff',
        weight: 1.4,
        opacity: 0.6,
      }}
    />
  );
}
