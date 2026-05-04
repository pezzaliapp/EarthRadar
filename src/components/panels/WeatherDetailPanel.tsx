import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWeatherGrid } from '@/hooks/useWeatherGrid';
import { wmoEntry, wmoSeverityColor } from '@/lib/wmoCodes';
import { buildShareUrl } from '@/lib/buildShareUrl';
import ShareButton from '@/components/common/ShareButton';
import type { WeatherCell, WeatherPoint } from '@/services/openMeteoApi';

/**
 * Pannello dettaglio della cella meteo selezionata.
 * Pesca i dati dallo stesso hook `useWeatherGrid`, così non servono nuove fetch.
 */
export default function WeatherDetailPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.weather?.enabled ?? false);
  const stepKm = useLayersStore((s) => s.weatherGridStepKm);
  const selected = useLayersStore((s) => s.selectedWeatherCell);
  const setSelected = useLayersStore((s) => s.setSelectedWeatherCell);

  const mapCenter = useLayersStore((s) => s.mapCenter);
  const { center, cells } = useWeatherGrid(enabled, mapCenter[0], mapCenter[1], stepKm);

  const point: (WeatherPoint & { direction?: WeatherCell['direction'] | 'CENTER' }) | null = useMemo(() => {
    if (!selected) return null;
    if (selected.direction === 'CENTER') return center ? { ...center, direction: 'CENTER' } : null;
    const cell = cells.find((x) => x.direction === selected.direction);
    return cell ?? null;
  }, [selected, center, cells]);

  if (!selected) return null;

  if (!point) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header
          title={t('weather.detailTitle')}
          subtitle={t(`weather.direction${selected.direction}`)}
          onClose={() => setSelected(null)}
        />
        <p className="text-space-300">{t('weather.noData')}</p>
      </aside>
    );
  }

  const wmo = wmoEntry(point.weatherCode);
  const sevColor = wmoSeverityColor(wmo.severity);
  const observed =
    point.observedAt > 0
      ? new Date(point.observedAt).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        })
      : '—';

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header
        title={t('weather.detailTitle')}
        subtitle={t(`weather.direction${selected.direction}`)}
        onClose={() => setSelected(null)}
      />

      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: `${sevColor}55`, background: `${sevColor}10` }}
      >
        <span className="text-3xl leading-none">{wmo.emoji}</span>
        <div>
          <p className="text-base font-semibold" style={{ color: sevColor }}>
            {point.temperatureC != null ? `${point.temperatureC.toFixed(1)} °C` : '—'}
          </p>
          <p className="text-[12px] text-space-200">{t(wmo.i18nKey)}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="label">{t('weather.wind')}</dt>
        <dd className="font-mono text-space-50">
          {point.windKmh != null ? `${point.windKmh.toFixed(0)} km/h` : '—'}
          {point.windDirDeg != null && (
            <>
              {' '}
              <span style={{ display: 'inline-block', transform: `rotate(${point.windDirDeg}deg)` }}>↑</span>
            </>
          )}
        </dd>

        <dt className="label">{t('weather.windDir')}</dt>
        <dd className="font-mono text-space-50">
          {point.windDirDeg != null ? `${point.windDirDeg.toFixed(0)}°` : '—'}
        </dd>

        <dt className="label">{t('weather.precip')}</dt>
        <dd className="font-mono text-space-50">
          {point.precipMm != null ? `${point.precipMm.toFixed(1)} mm` : '—'}
        </dd>

        <dt className="label">{t('weather.humidity')}</dt>
        <dd className="font-mono text-space-50">
          {point.humidityPct != null ? `${point.humidityPct.toFixed(0)} %` : '—'}
        </dd>

        <dt className="label">{t('weather.pressure')}</dt>
        <dd className="font-mono text-space-50">
          {point.pressureHpa != null ? `${point.pressureHpa.toFixed(0)} hPa` : '—'}
        </dd>

        <dt className="label">{t('weather.cloud')}</dt>
        <dd className="font-mono text-space-50">
          {point.cloudCoverPct != null ? `${point.cloudCoverPct.toFixed(0)} %` : '—'}
        </dd>

        <dt className="label">{t('weather.observedAt')}</dt>
        <dd className="font-mono text-space-50">{observed}</dd>
      </dl>

      <a
        className="btn-primary w-full"
        href={`https://open-meteo.com/en/docs?latitude=${point.lat.toFixed(2)}&longitude=${point.lon.toFixed(2)}`}
        target="_blank"
        rel="noreferrer"
      >
        🌦 {t('weather.openForecast')} ↗
      </a>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-space-300">{t('weather.attribution')}.</p>
        <ShareButton
          ariaLabel={t('share.ariaLabel')}
          getPayload={() => ({
            title: 'EarthRadar — Weather',
            text: `${point.lat.toFixed(2)}°, ${point.lon.toFixed(2)}°`,
            url: buildShareUrl({
              lat: point.lat,
              lon: point.lon,
              view: useSettingsStore.getState().viewMode,
              overlays: useLayersStore.getState().overlays,
            }),
          })}
        />
      </div>
    </aside>
  );
}

interface HeaderProps {
  title: string;
  subtitle: string;
  onClose: () => void;
}
function Header({ title, subtitle, onClose }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="label">{title}</p>
        <h2 className="truncate text-base font-semibold text-cyan-glow">{subtitle}</h2>
      </div>
      <button
        type="button"
        className="btn-ghost h-7 px-2 py-0 text-[11px]"
        onClick={onClose}
        aria-label="Close detail"
      >
        ✕
      </button>
    </header>
  );
}
