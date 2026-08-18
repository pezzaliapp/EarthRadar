import { Fragment, useMemo } from 'react';
import { Marker, Polygon, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useEonet } from '@/hooks/useEonet';
import { eonetCategorySpec } from '@/services/eonetCategories';
import { isValidLatLon } from '@/utils/coords';
import type {
  EonetEvent,
  EonetGeometry,
  EonetGeometryPoint,
  EonetGeometryPolygon,
} from '@/services/eonetApi';

/**
 * Overlay NASA EONET:
 *  - Marker (divIcon emoji categoria) sull'ultima geometry Point
 *  - Polyline tracking sulle geometry Point storiche (hurricane track)
 *  - Polygon outline + fill traslucido per geometry Polygon (es. iceberg)
 *
 * Il filtro categorie e il range giorni vengono dal layersStore.
 * I dati sono cachati lato apiCache (TTL 1 h) e re-pollati ogni 10 min.
 */

interface IconOpts {
  emoji: string;
  color: string;
  selected: boolean;
}

function makeEventIcon({ emoji, color, selected }: IconOpts): L.DivIcon {
  const size = selected ? 30 : 26;
  const ring = selected ? '#ff5cd0' : color;
  const glow = selected
    ? '0 0 16px rgba(255,92,208,0.85)'
    : `0 0 10px ${color}99`;
  const html = `
    <div style="
      width:${size}px; height:${size}px;
      display:grid; place-items:center;
      border-radius:9999px;
      border:1.5px solid ${ring};
      background: rgba(11,16,32,0.85);
      box-shadow:${glow};
      font-size:${size - 10}px;
      line-height:1;
    " aria-hidden>${emoji}</div>`;
  return L.divIcon({
    className: 'er-eonet-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function lastPointGeometry(geometry: EonetGeometry[]): EonetGeometryPoint | null {
  for (let i = geometry.length - 1; i >= 0; i--) {
    const g = geometry[i];
    if (g.type === 'Point') return g;
  }
  return null;
}

function polygonsOf(event: EonetEvent): EonetGeometryPolygon[] {
  return event.geometry.filter((g): g is EonetGeometryPolygon => g.type === 'Polygon');
}

function pointsOf(event: EonetEvent): EonetGeometryPoint[] {
  return event.geometry.filter((g): g is EonetGeometryPoint => g.type === 'Point');
}

/** GeoJSON polygon `[[lon,lat],...]` → Leaflet `[[lat,lon],...]`. */
function ringToLatLng(ring: Array<[number, number]>): Array<[number, number]> {
  return ring.map(([lon, lat]) => [lat, lon]);
}

export default function EonetLayer() {
  const enabled = useLayersStore((s) => s.overlays.eonet?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.eonet?.opacity ?? 1);
  const cats = useLayersStore((s) => s.eonetActiveCategories);
  const days = useLayersStore((s) => s.eonetDaysRange);
  const status = useLayersStore((s) => s.eonetStatus);
  const selectedId = useLayersStore((s) => s.eonetSelectedEventId);
  const setSelectedId = useLayersStore((s) => s.setEonetSelectedEventId);
  const { language } = useTranslation();

  const { data: events } = useEonet(enabled, {
    status,
    days,
    categoryIds: cats,
  });

  const visible = useMemo(() => {
    if (!enabled || events.length === 0) return [];
    if (cats.length === 0) return events;
    const allow = new Set(cats);
    return events.filter((e) => e.categories.some((c) => allow.has(c.id)));
  }, [enabled, events, cats]);

  if (!enabled) return null;

  return (
    <>
      {visible.map((evt) => {
        const cat = eonetCategorySpec(evt.categories[0]?.id);
        const isSelected = selectedId === evt.id;
        const last = lastPointGeometry(evt.geometry);
        const polys = polygonsOf(evt);
        const points = pointsOf(evt);
        const trackPositions = points.map(
          (p): [number, number] => [p.coordinates[1], p.coordinates[0]],
        );

        return (
          <Fragment key={evt.id}>
            {polys.map((poly, idx) => (
              <Polygon
                key={`${evt.id}:poly:${idx}`}
                positions={poly.coordinates.map(ringToLatLng)}
                pathOptions={{
                  color: cat.color,
                  weight: isSelected ? 2.2 : 1.4,
                  opacity,
                  fillColor: cat.color,
                  fillOpacity: opacity * (isSelected ? 0.28 : 0.16),
                }}
                eventHandlers={{
                  click: () => setSelectedId(evt.id),
                }}
              >
                <Tooltip direction="top" sticky>
                  <EventTooltipContent event={evt} categoryColor={cat.color} language={language} />
                </Tooltip>
              </Polygon>
            ))}

            {trackPositions.length >= 2 && (
              <Polyline
                positions={trackPositions}
                pathOptions={{
                  color: cat.color,
                  weight: isSelected ? 2.4 : 1.6,
                  opacity: opacity * (isSelected ? 0.85 : 0.55),
                  dashArray: '6 4',
                }}
              />
            )}

            {last && isValidLatLon(last.coordinates[1], last.coordinates[0]) && (
              <Marker
                position={[last.coordinates[1], last.coordinates[0]]}
                icon={makeEventIcon({ emoji: cat.emoji, color: cat.color, selected: isSelected })}
                opacity={opacity}
                eventHandlers={{
                  click: () => setSelectedId(evt.id),
                }}
              >
                <Tooltip direction="top" offset={[0, -14]} sticky>
                  <EventTooltipContent event={evt} categoryColor={cat.color} language={language} />
                </Tooltip>
              </Marker>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

interface TooltipProps {
  event: EonetEvent;
  categoryColor: string;
  language: 'it' | 'en';
}

function EventTooltipContent({ event, categoryColor, language }: TooltipProps) {
  const cat = eonetCategorySpec(event.categories[0]?.id);
  const lastDate = event.geometry[event.geometry.length - 1]?.date;
  const formatted = lastDate
    ? new Date(lastDate).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  return (
    <div className="text-[11px] leading-tight">
      <div className="font-semibold" style={{ color: categoryColor }}>
        {cat.emoji} {event.title}
      </div>
      <div className="font-mono text-space-200">{formatted}</div>
    </div>
  );
}
