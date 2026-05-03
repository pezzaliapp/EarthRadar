import { CircleMarker, Popup } from 'react-leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import {
  formatDepth,
  formatMagnitude,
  formatRelativeTime,
  quakeMarkerRadius,
  quakeSeverityColor,
} from '@/lib/quakeFormatters';
import type { Quake } from '@/services/usgsQuakesApi';

interface Props {
  quakes: Quake[];
  /** Callback opzionale chiamata sul click del marker (per fly-to). */
  onSelect?: (q: Quake) => void;
}

export default function EarthquakeLayer({ quakes, onSelect }: Props) {
  const enabled = useLayersStore((s) => s.overlays.quakes?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.quakes?.opacity ?? 1);
  const { t, language } = useTranslation();

  if (!enabled) return null;

  return (
    <>
      {quakes.map((q) => {
        const color = quakeSeverityColor(q.magnitude);
        const radius = quakeMarkerRadius(q.magnitude);
        return (
          <CircleMarker
            key={q.id}
            center={[q.lat, q.lon]}
            radius={radius}
            pathOptions={{
              color,
              weight: 1.5,
              opacity,
              fillColor: color,
              fillOpacity: opacity * (q.magnitude >= 5 ? 0.55 : 0.35),
            }}
            eventHandlers={{
              click: () => onSelect?.(q),
            }}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <div className="font-mono text-sm font-semibold" style={{ color }}>
                  {formatMagnitude(q.magnitude)}
                </div>
                <div>{q.place || '—'}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 text-[11px]">
                  <span className="opacity-70">{t('quakes.depth')}</span>
                  <span className="font-mono">{formatDepth(q.depthKm)}</span>
                  <span className="opacity-70">{t('quakes.when')}</span>
                  <span className="font-mono">{formatRelativeTime(q.time, Date.now(), language)}</span>
                  {q.tsunami && (
                    <>
                      <span className="opacity-70">{t('quakes.tsunami')}</span>
                      <span className="font-mono text-risk-high">⚠</span>
                    </>
                  )}
                </div>
                {q.url && (
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block pt-1 text-[11px] underline"
                    style={{ color }}
                  >
                    {t('quakes.openUsgs')} ↗
                  </a>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
