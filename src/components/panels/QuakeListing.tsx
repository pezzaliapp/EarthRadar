import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import {
  formatDepth,
  formatDistance,
  formatMagnitude,
  formatRelativeTime,
  quakeSeverity,
  quakeSeverityColor,
} from '@/lib/quakeFormatters';
import { haversineKm } from '@/utils/geo';
import type { Quake } from '@/services/usgsQuakesApi';

interface Props {
  quakes: Quake[];
  /** Centro mappa per ordinare per distanza. */
  center: [number, number];
  /** Click su una riga → fly-to. */
  onSelect: (q: Quake) => void;
  /** Optional id selezionato per evidenziarlo. */
  selectedId?: string | null;
  /** Numero massimo di righe mostrate. Default 25. */
  limit?: number;
}

interface Decorated {
  q: Quake;
  distanceKm: number;
}

export default function QuakeListing({ quakes, center, onSelect, selectedId, limit = 25 }: Props) {
  const { t, language } = useTranslation();

  const sorted = useMemo<Decorated[]>(() => {
    return quakes
      .map((q) => ({ q, distanceKm: haversineKm(center[0], center[1], q.lat, q.lon) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }, [quakes, center, limit]);

  if (sorted.length === 0) {
    return (
      <div className="glass p-4 text-sm text-space-300">{t('quakes.empty')}</div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map(({ q, distanceKm }) => {
        const sev = quakeSeverity(q.magnitude);
        const color = quakeSeverityColor(q.magnitude);
        const selected = q.id === selectedId;
        return (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onSelect(q)}
              className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                selected
                  ? 'border-cyan-glow/50 bg-cyan-glow/5'
                  : 'border-space-500/30 bg-space-800/40 hover:bg-space-800/70'
              }`}
              aria-current={selected || undefined}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-xs font-semibold"
                style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
                aria-label={`Severity ${sev}`}
              >
                {q.magnitude.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-space-50">{q.place || '—'}</span>
                <span className="block truncate text-[11px] font-mono text-space-300">
                  {formatMagnitude(q.magnitude)} · {formatDepth(q.depthKm)} ·{' '}
                  {formatRelativeTime(q.time, Date.now(), language)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[11px] text-space-200">
                  {formatDistance(distanceKm, language)}
                </span>
                {q.tsunami && (
                  <span className="block text-[10px] font-mono text-risk-high">⚠ tsunami</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
