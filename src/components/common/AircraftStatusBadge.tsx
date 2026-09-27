import { replayDelayMs } from '@/lib/aircraftReplay';
import type { AircraftView } from '@/store/aircraftStore';

interface Props {
  view: AircraftView;
  language: 'it' | 'en';
  /** Replay differito attivo (false con prefers-reduced-motion). */
  replay?: boolean;
}

/**
 * Stato del traffico aereo:
 *   loading     → "FLYITALYADSB · …"
 *   live        → "FLYITALYADSB · LIVE · differita 35 s" (verde; il movimento
 *                 sulla mappa è un replay differito di un intervallo)
 *   delayed     → "FLYITALYADSB · ritardo 48 s" (giallo, mai LIVE)
 *   unavailable → "Traffico aereo temporaneamente non disponibile" (discreto)
 * L'età indicata è quella della FOTOGRAFIA, non della singola posizione.
 * Il nome del provider arriva dal gateway; l'attribuzione è nel tooltip.
 */
export default function AircraftStatusBadge({ view, language, replay = true }: Props) {
  const it = language === 'it';
  const name = (view.snapshot?.provider.name || 'FlyItalyADSB').toUpperCase();
  const delayS = view.snapshot ? Math.round(replayDelayMs(view.snapshot.ttlS) / 1000) : null;
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
      label =
        `${name} · LIVE` +
        (replay && delayS !== null
          ? it
            ? ` · differita ${delayS} s`
            : ` · replay −${delayS} s`
          : '');
      cls = 'border-risk-low/40 text-risk-low';
      break;
    case 'delayed': {
      const s = Math.round((view.ageMs ?? 0) / 1000);
      label = `${name} · ${it ? `ritardo ${s} s` : `${s} s behind`}`;
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
