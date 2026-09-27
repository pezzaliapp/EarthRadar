import type { AircraftView } from '@/store/aircraftStore';

interface Props {
  view: AircraftView;
  language: 'it' | 'en';
}

/**
 * Stato del traffico aereo:
 *   loading     → "FLYITALYADSB · …"
 *   live        → "FLYITALYADSB · LIVE"                 (verde)
 *   stale       → "FLYITALYADSB · dati di 45 s fa"      (giallo, mai LIVE)
 *   unavailable → "Traffico aereo temporaneamente non disponibile" (discreto)
 * Il nome del provider arriva dal gateway; l'attribuzione è nel tooltip.
 */
export default function AircraftStatusBadge({ view, language }: Props) {
  const it = language === 'it';
  const name = (view.snapshot?.provider.name || 'FlyItalyADSB').toUpperCase();
  let label: string;
  let cls: string;
  let pulse = false;

  switch (view.freshness) {
    case 'off':
      return null;
    case 'loading':
      label = `${name} · …`;
      cls = 'border-cyan-glow/40 text-cyan-glow';
      pulse = true;
      break;
    case 'live':
      label = `${name} · LIVE`;
      cls = 'border-risk-low/40 text-risk-low';
      break;
    case 'stale': {
      const s = Math.round((view.ageMs ?? 0) / 1000);
      label = `${name} · ${it ? `dati di ${s} s fa` : `data ${s} s old`}`;
      cls = 'border-risk-mid/40 text-risk-mid';
      break;
    }
    case 'unavailable':
      label = it
        ? 'Traffico aereo temporaneamente non disponibile'
        : 'Air traffic temporarily unavailable';
      cls = 'border-space-500/40 text-space-300';
      break;
  }

  return (
    <span
      className={`chip ${cls}`}
      aria-live="polite"
      title={view.snapshot?.provider.attribution || undefined}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      />
      {label}
    </span>
  );
}
