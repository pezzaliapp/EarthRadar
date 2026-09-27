import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAircraftView } from '@/hooks/useAircraftFeed';
import { positionAgeNowS, useAircraftStore } from '@/store/aircraftStore';
import { aircraftTitle } from '@/lib/aircraftFormat';
import { renderAltitude } from '@/lib/aircraftMotion';
import { buildShareUrl } from '@/lib/buildShareUrl';
import ShareButton from '@/components/common/ShareButton';
import type { GatewayAircraft } from '@/services/aircraftGatewayApi';

/**
 * Pannello dettaglio aereo. Legge dallo store condiviso del gateway (nessuna
 * richiesta propria): i valori si aggiornano a ogni nuova fotografia reale.
 * Campo assente = "—", mai un valore stimato.
 */
export default function AircraftDetailPanel() {
  const { t, language } = useTranslation();
  const selected = useLayersStore((s) => s.selectedAircraft);
  const setSelected = useLayersStore((s) => s.setSelectedAircraft);
  const { aircraft, snapshot } = useAircraftView();
  const feedState = useAircraftStore();
  // Orologio a 1 s solo con un aereo selezionato (età della posizione).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!selected) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [selected]);

  const record: GatewayAircraft | null = useMemo(() => {
    if (!selected) return null;
    return aircraft.find((a) => a.id === selected.id) ?? null;
  }, [aircraft, selected]);

  if (!selected) return null;

  if (!record) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header
          title={t('aircraft.detailTitle')}
          subtitle={selected.label}
          onClose={() => setSelected(null)}
        />
        <p className="text-space-300">{t('aircraft.outOfView')}</p>
      </aside>
    );
  }

  const title = aircraftTitle(record, language);
  // Età della SINGOLA posizione (non della fotografia): da quando il provider l'ha rilevata.
  const positionAgeS = positionAgeNowS(record, feedState, now);
  const alt = renderAltitude(record);
  const fmtKm = (m: number | null) => (m !== null ? `${(m / 1000).toFixed(1)} km` : '—');
  const velKmh = record.groundSpeedMs !== null ? record.groundSpeedMs * 3.6 : null;
  const velKt = record.groundSpeedMs !== null ? record.groundSpeedMs * 1.94384 : null;
  const vertFpm = record.verticalRateMs !== null ? record.verticalRateMs * 196.85 : null;
  // Istante della posizione: tempo del provider meno l'età della posizione (entrambi reali).
  const positionTime =
    snapshot?.providerTime != null && record.positionAgeS !== null
      ? snapshot.providerTime - record.positionAgeS * 1000
      : null;
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleTimeString(language === 'it' ? 'it-IT' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC';
  const dash = '—';

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header
        title={t('aircraft.detailTitle')}
        subtitle={title}
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
        {record.privacyRestricted && (
          <span className="chip border-space-500/40 text-space-200">
            🔒 {t('aircraft.restricted')}
          </span>
        )}
        {record.squawk && (
          <span className="chip border-magenta-glow/40 text-magenta-glow">
            SQWK {record.squawk}
          </span>
        )}
        {record.emergency && (
          <span className="chip border-risk-high/40 text-risk-high">⚠ {record.emergency}</span>
        )}
      </div>

      {record.privacyRestricted && (
        <p className="text-[11px] text-space-300">{t('aircraft.restrictedHint')}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {!record.privacyRestricted && (
          <>
            <dt className="label">{t('aircraft.callsign')}</dt>
            <dd className="font-mono text-space-50">{record.callsign ?? dash}</dd>

            <dt className="label">{t('aircraft.registration')}</dt>
            <dd className="font-mono text-space-50">{record.registration ?? dash}</dd>
          </>
        )}

        <dt className="label">{t('aircraft.type')}</dt>
        <dd className="font-mono text-space-50">{record.typeCode ?? dash}</dd>

        <dt className="label">{t('aircraft.altBaro')}</dt>
        <dd className="font-mono text-space-50">
          {alt.kind === 'ground' ? t('aircraft.onGround') : fmtKm(record.altBaroM)}
        </dd>

        <dt className="label">{t('aircraft.altGeo')}</dt>
        <dd className="font-mono text-space-50">
          {alt.kind === 'ground' ? t('aircraft.onGround') : fmtKm(record.altGeomM)}
        </dd>

        <dt className="label">{t('aircraft.velocity')}</dt>
        <dd className="font-mono text-space-50">
          {velKmh !== null && velKt !== null
            ? `${velKmh.toFixed(0)} km/h · ${velKt.toFixed(0)} kt`
            : dash}
        </dd>

        <dt className="label">{t('aircraft.heading')}</dt>
        <dd className="font-mono text-space-50">
          {record.trackDeg !== null ? `${record.trackDeg.toFixed(0)}°` : dash}
        </dd>

        <dt className="label">{t('aircraft.verticalRate')}</dt>
        <dd className="font-mono text-space-50">
          {vertFpm !== null ? `${vertFpm.toFixed(0)} ft/min` : dash}
        </dd>

        <dt className="label">{t('aircraft.lastContact')}</dt>
        <dd className="font-mono text-space-50">
          {positionTime !== null ? fmtTime(positionTime) : dash}
        </dd>
      </dl>

      {positionAgeS !== null && (
        <p className="text-[11px] text-space-300">
          {t('aircraft.positionAge', { s: Math.round(positionAgeS) })} · {t('aircraft.replayNote')}
        </p>
      )}

      <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 p-3 font-mono text-[11px] text-cyan-glow">
        {record.lat.toFixed(3)}°, {record.lon.toFixed(3)}°
      </div>

      {!record.privacyRestricted && record.icao24 && (
        <a
          className="btn-primary w-full"
          href={`https://www.flightradar24.com/data/aircraft/${record.icao24}`}
          target="_blank"
          rel="noreferrer"
        >
          ✈ {t('aircraft.openFr24')} ↗
        </a>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-space-300">⚠ {t('aircraft.incertitude')}</p>
        <ShareButton
          ariaLabel={`${t('share.ariaLabel')} — ${title}`}
          getPayload={() => ({
            title: `EarthRadar — ${title}`,
            text: 'Live aircraft tracking',
            url: buildShareUrl({
              lat: record.lat,
              lon: record.lon,
              view: useSettingsStore.getState().viewMode,
              overlays: useLayersStore.getState().overlays,
            }),
          })}
        />
      </div>

      {snapshot?.provider.attribution && (
        <p className="text-[10px] text-space-300">
          <a className="underline" href={snapshot.provider.url} target="_blank" rel="noreferrer">
            {snapshot.provider.attribution}
          </a>
        </p>
      )}
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
