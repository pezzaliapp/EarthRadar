import { useMemo } from 'react';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useIss } from '@/hooks/useIss';
import { groundTrackSatrec } from '@/lib/sgp4Lite';

/**
 * Overlay ISS dedicato (separato da SatelliteLayer).
 * Differenze chiave:
 *  - marker più grande con alone variabile in base a `visibility` (sole vs ombra)
 *  - ground track ±45 min (passato + futuro), non solo i 90 min in avanti
 *  - smoothing 1Hz dal hook useIss
 *  - non dipende dall'attivazione del gruppo `stations` nel layer satelliti:
 *    può coesistere o essere il solo overlay attivo
 */

interface IssIconOpts {
  visibility: 'daylight' | 'eclipsed';
  selected: boolean;
}

function makeIssIcon({ visibility, selected }: IssIconOpts): L.DivIcon {
  const size = selected ? 36 : 30;
  const ring = visibility === 'daylight' ? '#ffd166' : '#5cf0ff';
  const glow =
    visibility === 'daylight'
      ? '0 0 18px rgba(255,209,102,0.85), 0 0 32px rgba(255,209,102,0.4)'
      : '0 0 18px rgba(92,240,255,0.85), 0 0 32px rgba(92,240,255,0.4)';
  const html = `
    <div style="
      width:${size}px; height:${size}px;
      display:grid; place-items:center;
      border-radius:9999px;
      border:1.5px solid ${ring};
      background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), rgba(11,16,32,0.85) 65%);
      box-shadow:${glow};
      font-size:${size - 12}px;
      line-height:1;
    " aria-hidden>🛰️</div>`;
  return L.divIcon({
    className: 'er-iss-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function IssLayer() {
  const enabled = useLayersStore((s) => s.overlays.iss?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.iss?.opacity ?? 1);
  const showGroundTrack = useLayersStore((s) => s.issShowGroundTrack);
  const { t } = useTranslation();
  const { live, smoothLat, smoothLon, smoothAltKm, smoothVelocityKmh, satrec } = useIss(enabled);

  const groundTrack = useMemo<Array<[number, number]> | null>(() => {
    if (!enabled || !showGroundTrack || !satrec) return null;
    const now = new Date();
    const past = groundTrackSatrec(satrec, new Date(now.getTime() - 45 * 60_000), 45, 30);
    const fut = groundTrackSatrec(satrec, now, 45, 30);
    const all = [...past, ...fut].map((p) => [p.lat, p.lon] as [number, number]);
    return all.length > 1 ? all : null;
  }, [enabled, showGroundTrack, satrec]);

  if (!enabled) return null;
  if (smoothLat === null || smoothLon === null) return null;

  const visibility = live?.visibility ?? 'daylight';
  const icon = makeIssIcon({ visibility, selected: false });

  return (
    <>
      {groundTrack && groundTrack.length > 1 && (
        <Polyline
          positions={groundTrack}
          pathOptions={{
            color: '#5cf0ff',
            weight: 1.6,
            opacity: opacity * 0.55,
            dashArray: '6 4',
          }}
        />
      )}
      <Marker position={[smoothLat, smoothLon]} icon={icon} opacity={opacity}>
        <Tooltip direction="top" offset={[0, -16]} sticky>
          <div className="text-[11px] leading-tight">
            <div className="font-semibold text-cyan-glow">🛰️ ISS (ZARYA)</div>
            <div className="font-mono text-space-200">
              {smoothAltKm != null ? `${smoothAltKm.toFixed(0)} km` : '—'} ·{' '}
              {smoothVelocityKmh != null ? `${(smoothVelocityKmh / 3600).toFixed(2)} km/s` : '—'}
            </div>
            <div className="font-mono text-space-300">
              {visibility === 'daylight'
                ? `☀ ${t('iss.visibilityDaylight')}`
                : `🌑 ${t('iss.visibilityEclipsed')}`}
            </div>
          </div>
        </Tooltip>
      </Marker>
    </>
  );
}
