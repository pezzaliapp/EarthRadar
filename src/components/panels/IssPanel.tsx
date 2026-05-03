import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useIss } from '@/hooks/useIss';
import {
  azimuthToCardinal,
  predictPasses,
  type ObserverLocation,
  type Pass,
} from '@/lib/passPredictor';
import { buildIcs, downloadIcs } from '@/lib/icsExporter';
import { cubeSatTleLink } from '@/lib/deepLinkBuilder';

const PASS_LIMIT = 5;
const WINDOW_HOURS = 48;

/**
 * Pannello ISS:
 *  - dati live (lat/lon/alt/velocity/visibility) dal hook useIss
 *  - passaggi visibili computati con SGP4 + observer ENU + filtro visibilità
 *    (sole sotto orizzonte all'osservatore + ISS illuminata)
 *  - export .ics con i prossimi 5 passaggi
 *  - deep link CubeSat 3D con TLE corrente
 *  - disclaimer obbligatorio (incertezza ±10s su LEO)
 */
export default function IssPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.iss?.enabled ?? false);
  const userLoc = useLayersStore((s) => s.userLocationForPasses);
  const setUserLoc = useLayersStore((s) => s.setUserLocationForPasses);
  const mapCenter = useLayersStore((s) => s.mapCenter);
  const showGroundTrack = useLayersStore((s) => s.issShowGroundTrack);
  const setShowGroundTrack = useLayersStore((s) => s.setIssShowGroundTrack);

  const { live, source, fetchedAt, satrec, iss } = useIss(enabled);

  const observer: ObserverLocation = useMemo(() => {
    if (userLoc) return { lat: userLoc.lat, lon: userLoc.lon };
    return { lat: mapCenter[0], lon: mapCenter[1] };
  }, [userLoc, mapCenter]);

  // Predizione passaggi: ricalcolata quando cambiano TLE o observer.
  const passes: Pass[] = useMemo(() => {
    if (!satrec) return [];
    const all = predictPasses({
      satrec,
      observer,
      windowHours: WINDOW_HOURS,
      stepSec: 60,
      minMaxElevDeg: 10,
    });
    return all.slice(0, PASS_LIMIT);
  }, [satrec, observer]);

  const handleUseGeo = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        /* user dismissed or denied; resta sul fallback centro mappa */
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const handleExport = () => {
    if (passes.length === 0) return;
    const ics = buildIcs(
      passes.map((p) => ({
        uid: `iss-${p.start}@earthradar.pezzaliapp`,
        start: p.start,
        end: p.end,
        summary: `ISS pass · ${p.maxElevationDeg.toFixed(0)}° · ${p.visible ? '✨' : '🌑'}`,
        description: [
          `${t('iss.passMaxElev')}: ${p.maxElevationDeg.toFixed(0)}°`,
          `${t('iss.passDirection')}: ${azimuthToCardinal(p.maxElevationAzimuthDeg)} (${p.maxElevationAzimuthDeg.toFixed(0)}°)`,
          `${t('iss.passDuration')}: ${formatDuration(p.durationSec, language)}`,
          p.visible
            ? `${t('iss.passVisible')} · ${t('iss.passMagnitude')} ${p.magnitude!.toFixed(1)}`
            : t('iss.passNotVisible'),
        ].join('\n'),
        location: `${observer.lat.toFixed(3)}, ${observer.lon.toFixed(3)}`,
      })),
    );
    downloadIcs(`iss-passes-${new Date().toISOString().slice(0, 10)}.ics`, ics);
  };

  if (!enabled) return null;

  const tleAgeHours = iss?.gp?.EPOCH
    ? (Date.now() - Date.parse(iss.gp.EPOCH)) / 3_600_000
    : null;

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label">{t('iss.title')}</p>
          <h2 className="truncate text-base font-semibold text-cyan-glow">ISS (ZARYA) · 25544</h2>
        </div>
        <span
          className={`chip ${
            source === 'fresh'
              ? 'border-risk-low/40 text-risk-low'
              : source === 'stale'
                ? 'border-risk-mid/40 text-risk-mid'
                : 'border-space-500/40 text-space-300'
          }`}
        >
          {source === 'fresh' ? '● live' : source === 'stale' ? t('iss.stale') : t('iss.loading')}
        </span>
      </header>

      {!live ? (
        <p className="text-space-300">{t('iss.noLive')}</p>
      ) : (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: live.visibility === 'daylight' ? '#ffd16655' : '#5cf0ff55',
            background: live.visibility === 'daylight' ? '#ffd16610' : '#5cf0ff10',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{live.visibility === 'daylight' ? '☀' : '🌑'}</span>
            <div>
              <p className="text-base font-semibold" style={{ color: '#5cf0ff' }}>
                {live.altKm.toFixed(0)} km · {(live.velocityKmh / 3600).toFixed(2)} km/s
              </p>
              <p className="text-[12px] text-space-200">
                {live.visibility === 'daylight' ? t('iss.visibilityDaylight') : t('iss.visibilityEclipsed')}
              </p>
            </div>
          </div>
        </div>
      )}

      {live && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="label">{t('iss.currentLat')}</dt>
          <dd className="font-mono text-space-50">{live.lat.toFixed(3)}°</dd>
          <dt className="label">{t('iss.currentLon')}</dt>
          <dd className="font-mono text-space-50">{live.lon.toFixed(3)}°</dd>
          <dt className="label">{t('iss.altitude')}</dt>
          <dd className="font-mono text-space-50">{live.altKm.toFixed(1)} km</dd>
          <dt className="label">{t('iss.velocity')}</dt>
          <dd className="font-mono text-space-50">{live.velocityKmh.toFixed(0)} km/h</dd>
          <dt className="label">{t('iss.footprint')}</dt>
          <dd className="font-mono text-space-50">{live.footprintKm.toFixed(0)} km</dd>
          {fetchedAt && (
            <>
              <dt className="label">{t('common.updated')}</dt>
              <dd className="font-mono text-space-50">
                {new Date(fetchedAt).toLocaleTimeString(language === 'it' ? 'it-IT' : 'en-US')}
              </dd>
            </>
          )}
          {tleAgeHours != null && (
            <>
              <dt className="label">{t('iss.tleAge')}</dt>
              <dd className="font-mono text-space-50">
                {t('iss.tleAgeHours', { hours: tleAgeHours.toFixed(1) })}
              </dd>
            </>
          )}
        </dl>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-space-500/30 bg-space-800/40 p-2">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-[12px] text-space-50">
          <input
            type="checkbox"
            checked={showGroundTrack}
            onChange={(e) => setShowGroundTrack(e.target.checked)}
            className="h-4 w-4 accent-cyan-glow"
          />
          {t('iss.showGroundTrack')}
        </label>
      </div>

      {/* Observer location */}
      <div className="space-y-1.5 rounded-lg border border-space-500/30 bg-space-800/40 p-2">
        <p className="label">{t('iss.locationLabel')}</p>
        <p className="font-mono text-[11px] text-space-200">
          {observer.lat.toFixed(3)}°, {observer.lon.toFixed(3)}°
          <span className="ml-2 text-space-400">
            ({userLoc ? t('iss.locationFromGeo') : t('iss.locationFromMap')})
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleUseGeo}
            className="btn-ghost h-7 px-2 py-0 text-[11px]"
          >
            📍 {t('iss.useMyLocation')}
          </button>
          {userLoc && (
            <button
              type="button"
              onClick={() => setUserLoc(null)}
              className="btn-ghost h-7 px-2 py-0 text-[11px]"
            >
              🗺 {t('iss.useMapCenter')}
            </button>
          )}
        </div>
      </div>

      {/* Passes */}
      <section className="space-y-2">
        <header className="flex items-baseline justify-between">
          <h3 className="label">{t('iss.passesTitle')}</h3>
          <span className="font-mono text-[10px] text-space-300">
            {passes.length}/{PASS_LIMIT}
          </span>
        </header>
        <p className="text-[11px] text-space-300">{t('iss.passesIntro')}</p>
        {!satrec && (
          <p className="text-[11px] text-risk-mid">{t('iss.tleMissing')}</p>
        )}
        {satrec && passes.length === 0 && (
          <p className="text-[11px] text-space-300">{t('iss.passesEmpty')}</p>
        )}
        <ul className="space-y-1.5">
          {passes.map((p) => (
            <PassRow key={p.start} pass={p} language={language} t={t} />
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="btn-primary w-full"
          onClick={handleExport}
          disabled={passes.length === 0}
        >
          📅 {t('iss.exportIcs')}
        </button>
        {iss && (
          <a
            className="btn-ghost w-full text-center"
            href={cubeSatTleLink(iss.tle)}
            target="_blank"
            rel="noreferrer"
          >
            🛰 {t('iss.openCubesat')} ↗
          </a>
        )}
      </div>

      <p className="text-[11px] text-space-300">{t('iss.attribution')}.</p>
      <p className="text-[10px] text-space-400">{t('iss.incertitude')}</p>
    </aside>
  );
}

interface PassRowProps {
  pass: Pass;
  language: 'it' | 'en';
  t: (key: string, params?: Record<string, string | number>) => string;
}

function PassRow({ pass, language, t }: PassRowProps) {
  const tone = pass.visible
    ? { border: '#5cf0ff66', bg: '#5cf0ff10', text: '#5cf0ff' }
    : { border: '#9aa3c955', bg: '#9aa3c910', text: '#cbd5e1' };
  const start = new Date(pass.start).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const cardinal = azimuthToCardinal(pass.maxElevationAzimuthDeg);
  return (
    <li
      className="rounded-md border p-2 text-[11px]"
      style={{ borderColor: tone.border, background: tone.bg }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold" style={{ color: tone.text }}>
          {start}
        </span>
        <span
          className="rounded px-1.5 py-0.5 font-mono uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.text, fontSize: 9 }}
        >
          {pass.visible ? `✨ ${t('iss.passVisible')}` : `🌑 ${t('iss.passNotVisible')}`}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-space-200">
        <span>
          ↑ {pass.maxElevationDeg.toFixed(0)}° · {cardinal} ({pass.maxElevationAzimuthDeg.toFixed(0)}°)
        </span>
        <span>⏱ {formatDuration(pass.durationSec, language)}</span>
        {pass.visible && pass.magnitude != null && (
          <span className="col-span-2">★ mag {pass.magnitude.toFixed(1)}</span>
        )}
      </div>
    </li>
  );
}

function formatDuration(sec: number, language: 'it' | 'en'): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return language === 'it' ? `${s} s` : `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
