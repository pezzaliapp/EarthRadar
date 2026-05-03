import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useEonet } from '@/hooks/useEonet';
import { eonetCategorySpec } from '@/services/eonetCategories';
import { trackVelocityKmh, type EonetEvent } from '@/services/eonetApi';

/**
 * Pannello dettaglio dell'evento EONET selezionato.
 *  - mostra categoria, stato (aperto/chiuso), ultimo update
 *  - per eventi con multiple geometry Point: velocità media e di picco
 *    (utile per uragani / iceberg in deriva)
 *  - link diretto al provider sorgente
 */
export default function EonetDetailPanel() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.eonet?.enabled ?? false);
  const selectedId = useLayersStore((s) => s.eonetSelectedEventId);
  const setSelectedId = useLayersStore((s) => s.setEonetSelectedEventId);
  const status = useLayersStore((s) => s.eonetStatus);
  const days = useLayersStore((s) => s.eonetDaysRange);
  const cats = useLayersStore((s) => s.eonetActiveCategories);

  const { data: events } = useEonet(enabled, { status, days, categoryIds: cats });

  const event: EonetEvent | null = useMemo(() => {
    if (!selectedId) return null;
    return events.find((e) => e.id === selectedId) ?? null;
  }, [events, selectedId]);

  if (!selectedId) return null;

  if (!event) {
    return (
      <aside className="glass-strong space-y-3 p-4 text-sm">
        <Header
          title={t('eonet.detailTitle')}
          subtitle={selectedId}
          onClose={() => setSelectedId(null)}
        />
        <p className="text-space-300">{t('eonet.empty')}</p>
      </aside>
    );
  }

  const cat = eonetCategorySpec(event.categories[0]?.id);
  const points = event.geometry.filter((g) => g.type === 'Point');
  const polys = event.geometry.filter((g) => g.type === 'Polygon');
  const velocities = trackVelocityKmh(event.geometry);
  const avgVel = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : null;
  const maxVel = velocities.length > 0 ? Math.max(...velocities) : null;

  const firstDate = event.geometry[0]?.date;
  const lastDate = event.geometry[event.geometry.length - 1]?.date;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(language === 'it' ? 'it-IT' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const lastGeom = event.geometry[event.geometry.length - 1];
  const magnitude =
    lastGeom && lastGeom.magnitudeValue != null
      ? `${lastGeom.magnitudeValue.toFixed(1)}${lastGeom.magnitudeUnit ? ` ${lastGeom.magnitudeUnit}` : ''}`
      : null;

  return (
    <aside className="glass-strong space-y-3 p-4 text-sm">
      <Header
        title={t('eonet.detailTitle')}
        subtitle={event.title}
        onClose={() => setSelectedId(null)}
      />

      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: `${cat.color}55`, background: `${cat.color}10` }}
      >
        <span className="text-3xl leading-none">{cat.emoji}</span>
        <div className="min-w-0">
          <p className="text-base font-semibold" style={{ color: cat.color }}>
            {t(cat.i18nKey)}
          </p>
          <p className="text-[12px] text-space-200">
            {event.closed ? `${t('eonet.closedAtLabel')} ${formatDate(event.closed)}` : t('eonet.stillOpen')}
          </p>
        </div>
      </div>

      {event.description && (
        <p className="text-[12px] leading-relaxed text-space-200">{event.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="label">{t('eonet.categoryLabel')}</dt>
        <dd className="font-mono text-space-50">{event.categories.map((c) => c.title).join(', ')}</dd>

        {firstDate && (
          <>
            <dt className="label">{t('eonet.openSinceLabel')}</dt>
            <dd className="font-mono text-space-50">{formatDate(firstDate)}</dd>
          </>
        )}

        {lastDate && (
          <>
            <dt className="label">{t('eonet.lastUpdate')}</dt>
            <dd className="font-mono text-space-50">{formatDate(lastDate)}</dd>
          </>
        )}

        {magnitude && (
          <>
            <dt className="label">{t('eonet.magnitude')}</dt>
            <dd className="font-mono text-space-50">{magnitude}</dd>
          </>
        )}

        <dt className="label">{t('eonet.trackLength')}</dt>
        <dd className="font-mono text-space-50">
          {points.length} pt{polys.length > 0 ? ` · ${polys.length} poly` : ''}
        </dd>

        {avgVel != null && (
          <>
            <dt className="label">{t('eonet.trackVelocityAvg')}</dt>
            <dd className="font-mono text-space-50">{avgVel.toFixed(0)} km/h</dd>
          </>
        )}

        {maxVel != null && maxVel !== avgVel && (
          <>
            <dt className="label">{t('eonet.trackVelocityMax')}</dt>
            <dd className="font-mono text-space-50">{maxVel.toFixed(0)} km/h</dd>
          </>
        )}
      </dl>

      {velocities.length > 0 && <VelocitySparkline values={velocities} color={cat.color} />}

      {event.sources.length > 0 && (
        <div className="space-y-1">
          <p className="label">{t('eonet.sources')}</p>
          <ul className="space-y-0.5 text-[11px]">
            {event.sources.map((s) => (
              <li key={s.id}>
                <a
                  className="underline decoration-dotted underline-offset-2"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: cat.color }}
                >
                  {s.id} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {event.link && (
        <a
          className="btn-primary w-full"
          href={event.link}
          target="_blank"
          rel="noreferrer"
        >
          🛰 {t('eonet.openOnNasa')} ↗
        </a>
      )}

      <p className="text-[11px] text-space-300">{t('eonet.attribution')}.</p>
      <p className="text-[10px] text-space-400">{t('eonet.incertitude')}</p>
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

interface SparklineProps {
  values: number[];
  color: string;
}

/**
 * Mini-grafico velocità (in km/h) tra geometry Point consecutive.
 * Utile per uragani che intensificano: si vede la curva di accelerazione.
 */
function VelocitySparkline({ values, color }: SparklineProps) {
  if (values.length === 0) return null;
  const w = 220;
  const h = 50;
  const pad = 4;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const dx = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * dx;
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="velocity sparkline">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] font-mono text-space-300">
        <span>min {min.toFixed(0)} km/h</span>
        <span>max {max.toFixed(0)} km/h</span>
      </div>
    </div>
  );
}
