import { formatRelativeTime } from '@/lib/quakeFormatters';
import type { CacheSource } from '@/lib/apiCache';

export type BadgeSource = CacheSource | 'pending' | 'saturated';

interface Props {
  /** Etichetta della sorgente (es. 'USGS', 'OpenSky'). */
  sourceLabel: string;
  source: BadgeSource;
  loading: boolean;
  error?: string | null;
  fetchedAt?: number | null;
  /** Quando `source === 'saturated'`, ms al ritorno. */
  cooldownMs?: number;
  language: 'it' | 'en';
}

/**
 * Badge sintetico che riassume lo stato di una fonte dati:
 *   pending → Loading
 *   fresh   → "Aggiornato 5s fa"     (verde)
 *   stale   → "Cache stantia"        (giallo)
 *   fallback→ "Fallback offline"     (giallo)
 *   saturated → "Fonte saturata, ritento tra Xm" (giallo, chiarificazione 3)
 *   error   → "Errore: …"            (rosso)
 */
export default function SourceBadge({
  sourceLabel,
  source,
  loading,
  error,
  fetchedAt,
  cooldownMs,
  language,
}: Props) {
  let label = '';
  let cls = 'border-space-500/40 text-space-300';
  let pulse = loading;

  if (loading && source === 'pending') {
    label = language === 'it' ? `Caricamento ${sourceLabel}…` : `Loading ${sourceLabel}…`;
    cls = 'border-cyan-glow/40 text-cyan-glow';
  } else if (error) {
    label = language === 'it' ? `${sourceLabel} · Errore` : `${sourceLabel} · Error`;
    cls = 'border-risk-high/40 text-risk-high';
  } else if (source === 'saturated') {
    const minutes = Math.max(1, Math.ceil((cooldownMs ?? 0) / 60_000));
    label =
      language === 'it'
        ? `${sourceLabel} · Fonte saturata, ritento tra ${minutes} min`
        : `${sourceLabel} · Source saturated, retrying in ${minutes} min`;
    cls = 'border-risk-mid/40 text-risk-mid';
    pulse = true;
  } else if (source === 'fresh') {
    label =
      `${sourceLabel} · ` +
      (language === 'it' ? 'Aggiornato' : 'Updated') +
      ` ${formatRelativeTime(fetchedAt ?? Date.now(), Date.now(), language)}`;
    cls = 'border-risk-low/40 text-risk-low';
  } else if (source === 'stale') {
    label = `${sourceLabel} · ${language === 'it' ? 'Cache stantia' : 'Stale cache'}`;
    cls = 'border-risk-mid/40 text-risk-mid';
  } else if (source === 'fallback') {
    label = `${sourceLabel} · ${language === 'it' ? 'Fallback offline' : 'Offline fallback'}`;
    cls = 'border-risk-mid/40 text-risk-mid';
  }

  return (
    <span className={`chip ${cls}`} aria-live="polite" title={error ?? undefined}>
      <span className={`h-1.5 w-1.5 rounded-full ${pulse ? 'animate-pulse motion-reduce:animate-none bg-current' : 'bg-current'}`} />
      {label}
    </span>
  );
}
