import type { DeviationLevel } from '@/lib/seismicStats';

/** Colore accento per ciascun livello di scostamento (mai rosso allarmistico). */
export const LEVEL_COLOR: Record<DeviationLevel, string> = {
  normal: '#34d399', // verde — nella norma
  above_average: '#fbbf24', // ambra — superiore alla media
  unusual: '#ff5cd0', // magenta brand — statisticamente insolito (attenzione, non emergenza)
  insufficient: '#6b75a8', // grigio-blu — dati insufficienti
};

/** Classi Tailwind (testo/bordo/sfondo) coerenti col livello. */
export const LEVEL_CLASSES: Record<DeviationLevel, string> = {
  normal: 'text-risk-low border-risk-low/40 bg-risk-low/10',
  above_average: 'text-risk-mid border-risk-mid/40 bg-risk-mid/10',
  unusual: 'text-magenta-glow border-magenta-glow/40 bg-magenta-glow/10',
  insufficient: 'text-space-300 border-space-500/40 bg-space-700/30',
};

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => (c === '-' ? '⁻' : SUP[Number(c)] ?? c))
    .join('');
}

/** Energia in notazione scientifica leggibile, es. "3.0 × 10¹⁸ J". */
export function formatEnergy(joules: number): string {
  if (!Number.isFinite(joules) || joules <= 0) return '—';
  const exp = Math.floor(Math.log10(joules));
  const mant = joules / Math.pow(10, exp);
  return `${mant.toFixed(1)} × 10${superscript(exp)} J`;
}

/** Numero con separatore e decimali opzionali. */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Percentuale con segno, es. "+18%". */
export function formatSignedPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const s = n >= 0 ? '+' : '';
  return `${s}${n.toFixed(0)}%`;
}

/** Data/ora UTC nel formato GG/MM/AAAA HH:MM. */
export function formatUtc(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return (
    `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}
