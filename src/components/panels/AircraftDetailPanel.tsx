import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useAircraft } from '@/hooks/useAircraft';
import type { Aircraft } from '@/services/openSkyApi';

/**
 * Pannello dettaglio aereo. Visibile quando `selectedAircraft` è set.
 * Pesca il record corrente dall'hook `useAircraft` (poll 30 s) — quindi i numeri
 * si aggiornano live finché l'aereo è ancora tracciato.
 */
export default function AircraftDetailPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const selected = useLayersStore((s) => s.selectedAircraft);
  const setSelected = useLayersStore((s) => s.setSelectedAircraft);
  const { data } = useAircraft(enabled);

  const record: Aircraft | null = useMemo(() => {
    if (!selected) return null;
    return data.find((a) => a.icao24 === selected.icao24) ?? null;
  }, [data, selected]);

  if (!selected) return null;

  if (!record) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header
          title={t('aircraft.detailTitle')}
          subtitle={selected.callsign || selected.icao24}
          onClose={() => setSelected(null)}
        />
        <p className="text-space-300">{t('aircraft.outOfView')}</p>
      </aside>
    );
  }

  const altBaroKm = record.baroAltM != null ? record.baroAltM / 1000 : null;
  const altGeoKm = record.geoAltM != null ? record.geoAltM / 1000 : null;
  const velKmh = record.velocityMs != null ? record.velocityMs * 3.6 : null;
  const velKt = record.velocityMs != null ? record.velocityMs * 1.94384 : null;
  const vertFpm = record.verticalRateMs != null ? record.verticalRateMs * 196.85 : null;
  const fr24 = `https://www.flightradar24.com/data/aircraft/${record.icao24}`;

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header
        title={t('aircraft.detailTitle')}
        subtitle={record.callsign || record.icao24}
        onClose={() => setSelected(null)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`chip ${
            record.onGround
              ? 'border-space-500/40 text-space-300'
              : 'border-risk-low/40 text-risk-low'
          }`}
        >
          {record.onGround ? `🛬 ${t('aircraft.onGround')}` : `✈ ${t('aircraft.inFlight')}`}
        </span>
        {record.squawk && (
          <span className="chip border-magenta-glow/40 text-magenta-glow">
            SQWK {record.squawk}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="label">{t('aircraft.icao24')}</dt>
        <dd className="font-mono text-space-50">{record.icao24}</dd>

        <dt className="label">{t('aircraft.callsign')}</dt>
        <dd className="font-mono text-space-50">{record.callsign || '—'}</dd>

        <dt className="label">{t('aircraft.country')}</dt>
        <dd className="font-mono text-space-50">{record.originCountry || '—'}</dd>

        <dt className="label">{t('aircraft.altBaro')}</dt>
        <dd className="font-mono text-space-50">{altBaroKm != null ? `${altBaroKm.toFixed(1)} km` : '—'}</dd>

        <dt className="label">{t('aircraft.altGeo')}</dt>
        <dd className="font-mono text-space-50">{altGeoKm != null ? `${altGeoKm.toFixed(1)} km` : '—'}</dd>

        <dt className="label">{t('aircraft.velocity')}</dt>
        <dd className="font-mono text-space-50">
          {velKmh != null && velKt != null
            ? `${velKmh.toFixed(0)} km/h · ${velKt.toFixed(0)} kt`
            : '—'}
        </dd>

        <dt className="label">{t('aircraft.heading')}</dt>
        <dd className="font-mono text-space-50">
          {record.headingDeg != null ? `${record.headingDeg.toFixed(0)}°` : '—'}
        </dd>

        <dt className="label">{t('aircraft.verticalRate')}</dt>
        <dd className="font-mono text-space-50">
          {vertFpm != null ? `${vertFpm.toFixed(0)} ft/min` : '—'}
        </dd>

        <dt className="label">{t('aircraft.lastContact')}</dt>
        <dd className="font-mono text-space-50">
          {record.lastContactSec
            ? new Date(record.lastContactSec * 1000).toLocaleTimeString(
                language === 'it' ? 'it-IT' : 'en-US',
                { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' },
              ) + ' UTC'
            : '—'}
        </dd>
      </dl>

      <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 p-3 font-mono text-[11px] text-cyan-glow">
        {record.lat.toFixed(3)}°, {record.lon.toFixed(3)}°
      </div>

      <a className="btn-primary w-full" href={fr24} target="_blank" rel="noreferrer">
        ✈ {t('aircraft.openFr24')} ↗
      </a>

      <p className="text-[11px] text-space-300">⚠ {t('aircraft.incertitude')}</p>
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
