import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useFires } from '@/hooks/useFires';
import { frpColor, frpSeverity, type FirmsBbox, type FirmsHotspot } from '@/services/firmsApi';
import { buildShareUrl } from '@/lib/buildShareUrl';
import ShareButton from '@/components/common/ShareButton';

/**
 * Pannello dettaglio dell'hotspot FIRMS selezionato.
 * Riusa lo stesso hook dell'overlay (cache condivisa) per evitare nuove fetch.
 *
 * L'id selezionato è composito: `lat,lon,acqDate,acqTime` — abbastanza univoco
 * per il viewport corrente nelle finestre 1..7 giorni FIRMS.
 */
export default function FireDetailPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const selectedId = useLayersStore((s) => s.selectedFireId);
  const setSelectedId = useLayersStore((s) => s.setSelectedFireId);
  const source = useLayersStore((s) => s.firesSource);
  const dayRange = useLayersStore((s) => s.firesDayRange);
  const mapCenter = useLayersStore((s) => s.mapCenter);

  // Ricaviamo un bbox approssimato dal centro mappa per non rompere la cache:
  // l'hook ha bisogno di un bbox per il poll. In pratica il selectedId è sempre
  // contenuto nel bbox visibile quando si arriva qui dal click sul marker.
  const bbox: FirmsBbox = useMemo(
    () => [mapCenter[1] - 5, mapCenter[0] - 5, mapCenter[1] + 5, mapCenter[0] + 5],
    [mapCenter],
  );

  const { hotspots } = useFires(enabled, { bbox, source, dayRange });

  const hotspot: FirmsHotspot | null = useMemo(() => {
    if (!selectedId) return null;
    return (
      hotspots.find(
        (h) => `${h.lat.toFixed(4)},${h.lon.toFixed(4)},${h.acqDate},${h.acqTime}` === selectedId,
      ) ?? null
    );
  }, [hotspots, selectedId]);

  if (!selectedId) return null;

  if (!hotspot) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header
          title={t('fires.detailTitle')}
          subtitle={selectedId}
          onClose={() => setSelectedId(null)}
        />
        <p className="text-space-300">{t('fires.notInViewport')}</p>
      </aside>
    );
  }

  const color = frpColor(hotspot.frp);
  const sev = frpSeverity(hotspot.frp);
  const acq = formatAcq(hotspot.acqDate, hotspot.acqTime, language);
  const firmsLink =
    `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${hotspot.lon.toFixed(3)},${hotspot.lat.toFixed(3)},10z`;

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header
        title={t('fires.detailTitle')}
        subtitle={`${hotspot.lat.toFixed(3)}°, ${hotspot.lon.toFixed(3)}°`}
        onClose={() => setSelectedId(null)}
      />

      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: `${color}55`, background: `${color}10` }}
      >
        <span className="text-3xl leading-none">🔥</span>
        <div>
          <p className="text-base font-semibold" style={{ color }}>
            {hotspot.frp.toFixed(0)} MW · {t(`fires.severity.${sev}`)}
          </p>
          <p className="text-[12px] text-space-200">
            {hotspot.instrument} / {hotspot.satellite} ·{' '}
            {hotspot.dayNight === 'D' ? `☀ ${t('fires.day')}` : `🌑 ${t('fires.night')}`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="label">{t('fires.acquired')}</dt>
        <dd className="font-mono text-space-50">{acq}</dd>

        <dt className="label">{t('fires.frp')}</dt>
        <dd className="font-mono text-space-50">{hotspot.frp.toFixed(1)} MW</dd>

        <dt className="label">{t('fires.brightness')}</dt>
        <dd className="font-mono text-space-50">
          {hotspot.brightness > 0 ? `${hotspot.brightness.toFixed(1)} K` : '—'}
        </dd>

        {hotspot.brightT31 > 0 && (
          <>
            <dt className="label">{t('fires.brightT31')}</dt>
            <dd className="font-mono text-space-50">{hotspot.brightT31.toFixed(1)} K</dd>
          </>
        )}

        <dt className="label">{t('fires.confidence')}</dt>
        <dd className="font-mono text-space-50">{hotspot.confidence}</dd>

        <dt className="label">{t('fires.scan')}</dt>
        <dd className="font-mono text-space-50">
          {hotspot.scan.toFixed(2)} × {hotspot.track.toFixed(2)} km
        </dd>

        <dt className="label">{t('fires.version')}</dt>
        <dd className="font-mono text-space-50">{hotspot.version}</dd>
      </dl>

      <a
        className="btn-primary w-full"
        href={firmsLink}
        target="_blank"
        rel="noreferrer"
      >
        🔥 {t('fires.openFirms')} ↗
      </a>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-space-400">{t('fires.incertitude')}</p>
        <ShareButton
          ariaLabel={`${t('share.ariaLabel')} — FIRMS hotspot`}
          getPayload={() => ({
            title: 'EarthRadar — Fire hotspot',
            text: `FRP ${hotspot.frp.toFixed(1)} MW · ${frpSeverity(hotspot.frp)}`,
            url: buildShareUrl({
              lat: hotspot.lat,
              lon: hotspot.lon,
              view: useSettingsStore.getState().viewMode,
              overlays: useLayersStore.getState().overlays,
            }),
          })}
        />
      </div>
      <p className="text-[11px] text-space-300">{t('fires.attribution')}.</p>
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

function formatAcq(date: string, time: string, language: 'it' | 'en'): string {
  if (!date || !time) return `${date} ${time}`.trim();
  const padded = time.padStart(4, '0');
  const hh = padded.slice(0, 2);
  const mm = padded.slice(2, 4);
  const iso = `${date}T${hh}:${mm}:00Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return `${date} ${hh}:${mm} UTC`;
  return d.toLocaleString(language === 'it' ? 'it-IT' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
