import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useWeatherGrid } from '@/hooks/useWeatherGrid';
import { wmoEntry } from '@/lib/wmoCodes';

/**
 * 8 marker meteo direzionali + 1 al centro mappa. Icona dinamica da WMO code,
 * tooltip con temperatura/vento/condizione, click → setSelectedWeatherCell.
 */
function makeWeatherIcon(emoji: string, selected: boolean): L.DivIcon {
  const ring = selected ? 'border-color:#ff5cd0;box-shadow:0 0 14px rgba(255,92,208,0.85);' : 'border-color:rgba(92,240,255,0.7);box-shadow:0 0 8px rgba(92,240,255,0.55);';
  const html = `
    <div style="display:grid;place-items:center;width:36px;height:36px;border-radius:9999px;background:rgba(11,17,41,0.85);border:1.5px solid;${ring}font-size:20px;line-height:1;">
      ${emoji}
    </div>`;
  return L.divIcon({
    className: 'er-weather-icon',
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function WeatherLayer() {
  const enabled = useLayersStore((s) => s.overlays.weather?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.weather?.opacity ?? 1);
  const stepKm = useLayersStore((s) => s.weatherGridStepKm);
  const selected = useLayersStore((s) => s.selectedWeatherCell);
  const setSelected = useLayersStore((s) => s.setSelectedWeatherCell);
  const { t, language } = useTranslation();

  // Centro mappa è in store (aggiornato dal MapRefBridge in Map2D), così
  // il pannello dettaglio fuori dal MapContainer può leggere lo stesso valore.
  const center = useLayersStore((s) => s.mapCenter);
  const { center: centerData, cells } = useWeatherGrid(enabled, center[0], center[1], stepKm);

  const points = useMemo(() => {
    if (!enabled) return [];
    const out: Array<{ lat: number; lon: number; direction: 'CENTER' | typeof cells[number]['direction']; tempC: number | null; windKmh: number | null; windDir: number | null; precipMm: number | null; weatherCode: number | null }> = [];
    if (centerData) {
      out.push({
        lat: centerData.lat,
        lon: centerData.lon,
        direction: 'CENTER',
        tempC: centerData.temperatureC,
        windKmh: centerData.windKmh,
        windDir: centerData.windDirDeg,
        precipMm: centerData.precipMm,
        weatherCode: centerData.weatherCode,
      });
    }
    for (const c of cells) {
      out.push({
        lat: c.lat,
        lon: c.lon,
        direction: c.direction,
        tempC: c.temperatureC,
        windKmh: c.windKmh,
        windDir: c.windDirDeg,
        precipMm: c.precipMm,
        weatherCode: c.weatherCode,
      });
    }
    return out;
  }, [enabled, centerData, cells]);

  if (!enabled) return null;

  return (
    <>
      {points.map((p) => {
        const wmo = wmoEntry(p.weatherCode);
        const isSelected = selected?.direction === p.direction;
        const icon = makeWeatherIcon(wmo.emoji, isSelected);
        const dirLabel = t(`weather.direction${p.direction}`);
        return (
          <Marker
            key={p.direction}
            position={[p.lat, p.lon]}
            icon={icon}
            opacity={opacity}
            eventHandlers={{
              click: () => setSelected({ direction: p.direction }),
            }}
          >
            <Tooltip direction="top" offset={[0, -18]} sticky>
              <div className="text-[11px] leading-tight">
                <div className="font-semibold text-cyan-glow">
                  {dirLabel}
                  {p.tempC != null && <> · {p.tempC.toFixed(1)} °C</>}
                </div>
                <div className="font-mono text-space-200">
                  {t(wmo.i18nKey)}
                </div>
                {p.windKmh != null && (
                  <div className="font-mono text-space-300">
                    💨 {p.windKmh.toFixed(0)} km/h
                    {p.windDir != null && (
                      <>
                        {' · '}
                        <span style={{ display: 'inline-block', transform: `rotate(${p.windDir}deg)` }}>↑</span>{' '}
                        {p.windDir.toFixed(0)}°
                      </>
                    )}
                  </div>
                )}
                {p.precipMm != null && p.precipMm > 0 && (
                  <div className="font-mono text-space-300">🌧 {p.precipMm.toFixed(1)} mm</div>
                )}
                <div className="text-[10px] text-space-300">
                  {language === 'it' ? 'Click per dettaglio' : 'Click for detail'}
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
