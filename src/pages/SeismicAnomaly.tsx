import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useSeismicAnomaly } from '@/hooks/useSeismicAnomaly';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  AFTERSHOCK_WINDOW_DAYS,
  AFTERSHOCK_RADIUS_KM,
  type DeviationLevel,
} from '@/lib/seismicStats';
import type { SeismicThreshold, SeismicWindowDays } from '@/lib/seismicAnalysis';
import {
  LEVEL_CLASSES,
  LEVEL_COLOR,
  formatEnergy,
  formatNumber,
  formatSignedPercent,
  formatUtc,
} from './anomaly/format';
import {
  CurrentVsHistoryChart,
  AnnualTrendChart,
  EnergyBars,
  MagnitudeDistributionChart,
  ChartLegend,
} from './anomaly/AnomalyCharts';

const WINDOWS: SeismicWindowDays[] = [30, 60, 90];
const THRESHOLDS: SeismicThreshold[] = [5.5, 6.0, 7.0];

/** Segmented control accessibile (button group con aria-pressed). */
function Segmented<T extends number>(props: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="label">{props.label}</div>
      <div className="inline-flex rounded-xl border border-space-500/40 bg-space-900/50 p-1" role="group" aria-label={props.label}>
        {props.options.map((opt) => {
          const active = opt === props.value;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => props.onChange(opt)}
              className={`min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-mono transition-colors ${
                active
                  ? 'bg-cyan-glow/15 text-cyan-glow'
                  : 'text-space-300 hover:text-space-50'
              }`}
            >
              {props.format(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SeismicAnomaly() {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const [windowDays, setWindowDays] = useState<SeismicWindowDays>(30);
  const [threshold, setThreshold] = useState<SeismicThreshold>(5.5);

  const { analysis, source, loading, error, fetchedAt, baselineMeta, refresh } = useSeismicAnomaly(
    windowDays,
    threshold,
  );

  const level: DeviationLevel = analysis?.deviation.level ?? 'insufficient';

  // Riga freschezza dati.
  let freshness: string;
  if (!online) freshness = t('anomaly.data.offline');
  else if (source === 'fresh') freshness = t('anomaly.data.updated', { date: formatUtc(fetchedAt) });
  else if (source === 'stale' || source === 'fallback')
    freshness = t('anomaly.data.cached', { date: formatUtc(fetchedAt) });
  else freshness = t('anomaly.data.loading');

  return (
    <div className="space-y-6">
      {/* ─── Intestazione ─────────────────────────────────────────────── */}
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-space-50">{t('anomaly.title')}</h1>
        <p className="label text-cyan-glow">{t('anomaly.subtitle')}</p>
        <p className="max-w-3xl pt-2 text-base font-medium text-space-100">{t('anomaly.question')}</p>
        <p className="max-w-3xl pt-1 text-sm leading-relaxed text-space-200">{t('anomaly.intro')}</p>
      </header>

      {/* ─── Disclaimer specifico ─────────────────────────────────────── */}
      <section className="glass space-y-2 border-l-2 border-l-cyan-glow/50 p-4 text-sm">
        <p className="text-space-100">{t('anomaly.disclaimer.primary')}</p>
        <p className="text-xs leading-relaxed text-space-300">{t('anomaly.disclaimer.secondary')}</p>
      </section>

      {/* ─── Controlli ────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-end gap-4">
        <Segmented
          label={t('anomaly.controls.window')}
          value={windowDays}
          options={WINDOWS}
          onChange={setWindowDays}
          format={(v) => t('anomaly.controls.days', { n: v })}
        />
        <Segmented
          label={t('anomaly.controls.threshold')}
          value={threshold}
          options={THRESHOLDS}
          onChange={setThreshold}
          format={(v) => `M≥${v.toFixed(1)}`}
        />
      </section>

      {/* ─── Riga dati/fonte ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-space-300">
        <span>{freshness}</span>
        <span>{t('anomaly.data.source')}</span>
      </div>

      {/* ─── Stato errore ─────────────────────────────────────────────── */}
      {error && !analysis && (
        <section className="glass space-y-3 p-6 text-center">
          <p className="text-space-100">{t('anomaly.data.unavailable')}</p>
          <button type="button" className="btn-primary" onClick={refresh}>
            {t('anomaly.data.retry')}
          </button>
        </section>
      )}

      {/* ─── Stato caricamento ────────────────────────────────────────── */}
      {loading && !analysis && (
        <section className="glass p-6 text-center text-sm text-space-300" aria-live="polite">
          {t('anomaly.data.loading')}
        </section>
      )}

      {analysis && (
        <>
          {/* ─── Indice di scostamento ─────────────────────────────────── */}
          <section
            className={`rounded-2xl border p-6 ${LEVEL_CLASSES[level]}`}
            aria-live="polite"
          >
            <div className="label opacity-80">{t('anomaly.index.title')}</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: LEVEL_COLOR[level] }}
                aria-hidden
              />
              <span className="text-xl font-semibold">{t(`anomaly.index.${level}.label`)}</span>
            </div>
            <p className="mt-2 text-sm text-space-100">{t(`anomaly.index.${level}.desc`)}</p>
            {level !== 'insufficient' && Number.isFinite(analysis.deviation.percentile) && (
              <p className="mt-2 text-xs font-mono text-space-200">
                {t('anomaly.index.percentileNote', {
                  p: analysis.deviation.percentile.toFixed(0),
                })}
              </p>
            )}
            {analysis.deviation.lowCountCaution && (
              <p className="mt-2 text-xs text-space-300">⚠ {t('anomaly.index.lowCountCaution')}</p>
            )}
          </section>

          {/* ─── Statistiche ───────────────────────────────────────────── */}
          <section className="glass space-y-4 p-6">
            <h2 className="label text-cyan-glow">{t('anomaly.stats.title')}</h2>
            {level === 'insufficient' ? (
              <p className="text-sm text-space-200">{t('anomaly.stats.insufficientSample')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <Stat label={t('anomaly.stats.current')} value={formatNumber(analysis.currentCount)} strong />
                <Stat label={t('anomaly.stats.mean')} value={formatNumber(analysis.deviation.mean, 1)} />
                <Stat label={t('anomaly.stats.median')} value={formatNumber(analysis.deviation.median, 0)} />
                <Stat label={t('anomaly.stats.sd')} value={formatNumber(analysis.deviation.sd, 1)} />
                <Stat
                  label={t('anomaly.stats.percentChange')}
                  value={formatSignedPercent(analysis.deviation.percentChange)}
                />
                <Stat
                  label={t('anomaly.stats.percentile')}
                  value={`${analysis.deviation.percentile.toFixed(0)}°`}
                />
                <Stat
                  label={t('anomaly.stats.zscore')}
                  value={Number.isFinite(analysis.deviation.zScore) ? analysis.deviation.zScore.toFixed(2) : '—'}
                  hint={t('anomaly.stats.zscoreNote')}
                />
                <Stat label={t('anomaly.stats.sampleSize')} value={formatNumber(analysis.deviation.sampleSize)} />
              </div>
            )}
          </section>

          {/* ─── Grafici ──────────────────────────────────────────────── */}
          <section className="glass space-y-3 p-6">
            <h2 className="label text-cyan-glow">{t('anomaly.charts.currentVsHistory.title')}</h2>
            <p className="text-sm text-space-200">{t('anomaly.charts.currentVsHistory.intro')}</p>
            {analysis.baselineSamples.length > 0 ? (
              <CurrentVsHistoryChart
                samples={analysis.baselineSamples}
                current={analysis.currentCount}
                mean={analysis.deviation.mean}
                median={analysis.deviation.median}
                accent={LEVEL_COLOR[level]}
                title={t('anomaly.charts.currentVsHistory.title')}
                labels={{
                  min: t('anomaly.charts.min'),
                  max: t('anomaly.charts.max'),
                  mean: t('anomaly.charts.mean'),
                  median: t('anomaly.charts.median'),
                  current: t('anomaly.charts.current'),
                  events: t('anomaly.charts.events'),
                }}
              />
            ) : (
              <p className="text-sm text-space-300">{t('anomaly.charts.noData')}</p>
            )}
          </section>

          <section className="glass space-y-3 p-6">
            <h2 className="label text-cyan-glow">{t('anomaly.charts.annualTrend.title')}</h2>
            <p className="text-sm text-space-200">
              {t('anomaly.charts.annualTrend.intro', { thr: threshold.toFixed(1) })}
            </p>
            <AnnualTrendChart
              annual={analysis.annual}
              title={t('anomaly.charts.annualTrend.title')}
              yLabel={t('anomaly.charts.events')}
            />
          </section>

          <section className="glass space-y-3 p-6">
            <h2 className="label text-cyan-glow">{t('anomaly.energy.title')}</h2>
            <p className="text-sm text-space-200">{t('anomaly.energy.intro')}</p>
            <EnergyBars
              current={analysis.currentEnergyJoules}
              baseline={analysis.baselineWindowEnergyMean}
              labels={{ current: t('anomaly.energy.current'), baseline: t('anomaly.energy.baseline') }}
              formatValue={formatEnergy}
            />
            <p className="text-xs text-space-300">{t('anomaly.energy.note')}</p>
          </section>

          <section className="glass space-y-3 p-6">
            <h2 className="label text-cyan-glow">{t('anomaly.charts.magnitudeDistribution.title')}</h2>
            <p className="text-sm text-space-200">{t('anomaly.charts.magnitudeDistribution.intro')}</p>
            <MagnitudeDistributionChart
              current={analysis.currentBins}
              baseline={analysis.baselineBins}
              title={t('anomaly.charts.magnitudeDistribution.title')}
              labels={{
                m55: '5.5–5.9',
                m60: '6.0–6.9',
                m70: '≥7.0',
                current: t('anomaly.charts.current'),
                baseline: t('anomaly.charts.baselineMean'),
              }}
            />
            <ChartLegend
              current={t('anomaly.charts.current')}
              baseline={t('anomaly.charts.baselineMean')}
            />
          </section>

          {/* ─── Aftershock / clustering ──────────────────────────────── */}
          <section className="glass space-y-2 p-6 text-sm">
            <h2 className="label text-magenta-glow">{t('anomaly.aftershock.title')}</h2>
            <p className="text-space-200">{t('anomaly.aftershock.note')}</p>
            {analysis.aftershock.likelySequence && Number.isFinite(analysis.aftershock.mainshockMag) && (
              <p className="text-space-100">
                {t('anomaly.aftershock.sequence', {
                  pct: (analysis.aftershock.clusteredFraction * 100).toFixed(0),
                  mag: analysis.aftershock.mainshockMag.toFixed(1),
                  days: AFTERSHOCK_WINDOW_DAYS,
                  km: AFTERSHOCK_RADIUS_KM,
                })}
              </p>
            )}
            <p className="text-xs text-space-300">{t('anomaly.aftershock.noDeclustering')}</p>
          </section>

          {/* ─── Come leggere ─────────────────────────────────────────── */}
          <section className="glass-strong space-y-3 p-6 text-sm">
            <h2 className="text-lg font-semibold text-cyan-glow">{t('anomaly.howToRead.title')}</h2>
            <p className="text-space-100">
              <strong className="text-space-50">{t('anomaly.howToRead.p1bold')}</strong>{' '}
              {t('anomaly.howToRead.p1')}
            </p>
            <p className="text-space-100">
              <strong className="text-space-50">{t('anomaly.howToRead.p2bold')}</strong>{' '}
              {t('anomaly.howToRead.p2')}
            </p>
          </section>

          {/* ─── Metodo ───────────────────────────────────────────────── */}
          <section className="glass space-y-2 p-6 text-sm">
            <h2 className="label text-cyan-glow">{t('anomaly.method.title')}</h2>
            <p className="text-space-200">{t('anomaly.method.intro')}</p>
            <ul className="space-y-1.5 font-mono text-xs leading-relaxed text-space-200">
              <li>{t('anomaly.method.source', { source: baselineMeta?.source ?? 'USGS' })}</li>
              <li>
                {t('anomaly.method.baselinePeriod', {
                  start: baselineMeta?.baselineStart ?? '2006-01-01',
                  end: baselineMeta?.baselineEnd ?? '2025-12-31',
                })}
              </li>
              <li>{t('anomaly.method.window', { n: windowDays })}</li>
              <li>{t('anomaly.method.threshold', { thr: threshold.toFixed(1) })}</li>
              <li>{t('anomaly.method.statsLine')}</li>
              <li>{t('anomaly.method.classification')}</li>
              <li>{t('anomaly.method.energy')}</li>
              <li>{t('anomaly.method.clustering')}</li>
              <li>{t('anomaly.method.limits')}</li>
              <li>{t('anomaly.method.updated', { date: formatUtc(fetchedAt) })}</li>
              <li>{t('anomaly.method.reproduce', { cmd: baselineMeta?.reproduce ?? 'node scripts/generateSeismicBaseline.mjs' })}</li>
            </ul>
          </section>

          {/* ─── Limiti scientifici ───────────────────────────────────── */}
          <section className="glass space-y-2 p-6 text-sm">
            <h2 className="label text-magenta-glow">{t('anomaly.limits.title')}</h2>
            <p className="text-space-100">✓ {t('anomaly.limits.can')}</p>
            <p className="text-space-100">✗ {t('anomaly.limits.cannot')}</p>
          </section>
        </>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="label text-space-300">{props.label}</div>
      <div
        className={`font-mono ${props.strong ? 'text-xl text-cyan-glow' : 'text-lg text-space-50'}`}
        title={props.hint}
      >
        {props.value}
      </div>
    </div>
  );
}
