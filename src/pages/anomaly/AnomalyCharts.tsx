/**
 * AnomalyCharts.tsx — grafici in SVG nativo (nessuna dipendenza esterna) per la
 * pagina Anomalia Sismica. Tutti responsive (viewBox + width 100%), statici
 * (nessuna animazione → rispettano prefers-reduced-motion) e accessibili
 * (role="img" + aria-label). Le scale sono corrette per non drammatizzare
 * variazioni statisticamente piccole (assi che partono da 0, min–max reali).
 */

import { useMemo } from 'react';
import type { MagnitudeBins } from '@/lib/seismicStats';

const AXIS = '#3e4a85'; // space-400
const GRID = '#1f2a5a'; // space-500
const TEXT = '#9aa3c9'; // space-200
const TEXT_STRONG = '#e6e9f5'; // space-50
const HIST = '#6b75a8'; // space-300 (storico)
const CURRENT = '#5cf0ff'; // cyan-glow (attuale)

// ─────────────────────────────────────────────────────────────────────────────
// 1) Attuale vs storico — linea numerica con range storico e marcatore corrente
// ─────────────────────────────────────────────────────────────────────────────
export function CurrentVsHistoryChart(props: {
  samples: number[];
  current: number;
  mean: number;
  median: number;
  accent: string;
  labels: { min: string; max: string; mean: string; median: string; current: string; events: string };
  title: string;
}) {
  const { samples, current, mean, median, accent, labels, title } = props;
  const W = 600;
  const H = 150;
  const padX = 48;
  const axisY = 95;

  const stats = useMemo(() => {
    if (samples.length === 0) return null;
    const lo = Math.min(...samples);
    const hi = Math.max(...samples);
    const domainMax = Math.max(hi, current) * 1.08 || 1;
    const x = (v: number) => padX + (v / domainMax) * (W - 2 * padX);
    return { lo, hi, domainMax, x };
  }, [samples, current]);

  if (!stats) return null;
  const { lo, hi, x } = stats;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${title}: ${labels.current} ${current}, ${labels.mean} ${mean.toFixed(0)}, ${labels.median} ${median}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* asse */}
      <line x1={padX} y1={axisY} x2={W - padX} y2={axisY} stroke={AXIS} strokeWidth="1.5" />
      <text x={padX} y={axisY + 22} fill={TEXT} fontSize="12">0</text>
      {/* banda range storico min–max */}
      <rect
        x={x(lo)}
        y={axisY - 12}
        width={Math.max(2, x(hi) - x(lo))}
        height={24}
        rx="6"
        fill={HIST}
        opacity="0.28"
      />
      <text x={x(lo)} y={axisY + 22} fill={TEXT} fontSize="11" textAnchor="middle">
        {labels.min} {lo}
      </text>
      <text x={x(hi)} y={axisY + 22} fill={TEXT} fontSize="11" textAnchor="middle">
        {labels.max} {hi}
      </text>
      {/* mediana */}
      <line x1={x(median)} y1={axisY - 16} x2={x(median)} y2={axisY + 16} stroke={HIST} strokeWidth="1.5" strokeDasharray="3 3" />
      {/* media */}
      <line x1={x(mean)} y1={axisY - 16} x2={x(mean)} y2={axisY + 16} stroke={TEXT_STRONG} strokeWidth="1.5" />
      <text x={x(mean)} y={axisY - 22} fill={TEXT_STRONG} fontSize="11" textAnchor="middle">
        {labels.mean} {mean.toFixed(0)}
      </text>
      {/* marcatore corrente */}
      <line x1={x(current)} y1={axisY - 34} x2={x(current)} y2={axisY} stroke={accent} strokeWidth="2" />
      <circle cx={x(current)} cy={axisY} r="6" fill={accent} />
      <text x={x(current)} y={axisY - 40} fill={accent} fontSize="13" fontWeight="600" textAnchor="middle">
        {labels.current} {current}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Andamento storico — barre annuali
// ─────────────────────────────────────────────────────────────────────────────
export function AnnualTrendChart(props: {
  annual: Array<{ year: number; count: number }>;
  title: string;
  yLabel: string;
}) {
  const { annual, title, yLabel } = props;
  const W = 600;
  const H = 220;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  if (annual.length === 0) return null;
  const maxCount = Math.max(...annual.map((a) => a.count), 1);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = plotW / annual.length;
  const y = (v: number) => padT + plotH - (v / maxCount) * plotH;

  // tick asse Y: 0, metà, max
  const ticks = [0, Math.round(maxCount / 2), maxCount];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${title}. ${yLabel}. ${annual.map((a) => `${a.year}: ${a.count}`).join(', ')}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={padL} y1={y(tk)} x2={W - padR} y2={y(tk)} stroke={GRID} strokeWidth="1" />
          <text x={padL - 6} y={y(tk) + 4} fill={TEXT} fontSize="11" textAnchor="end">
            {tk}
          </text>
        </g>
      ))}
      {annual.map((a, i) => {
        const bx = padL + i * barW + barW * 0.15;
        const bw = barW * 0.7;
        const bh = padT + plotH - y(a.count);
        return (
          <g key={a.year}>
            <rect x={bx} y={y(a.count)} width={bw} height={bh} rx="2" fill={HIST} />
            {(i === 0 || i === annual.length - 1 || a.year % 5 === 0) && (
              <text x={bx + bw / 2} y={H - padB + 16} fill={TEXT} fontSize="10" textAnchor="middle">
                {String(a.year).slice(2)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) Energia sismica — due barre orizzontali (attuale vs media storica)
// ─────────────────────────────────────────────────────────────────────────────
export function EnergyBars(props: {
  current: number;
  baseline: number;
  labels: { current: string; baseline: string };
  formatValue: (j: number) => string;
}) {
  const { current, baseline, labels, formatValue } = props;
  const W = 600;
  const H = 120;
  const padL = 130;
  const padR = 16;
  const maxV = Math.max(current, baseline, 1);
  const barMax = W - padL - padR;
  const rows = [
    { label: labels.current, value: current, color: CURRENT },
    { label: labels.baseline, value: baseline, color: HIST },
  ];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${labels.current}: ${formatValue(current)}. ${labels.baseline}: ${formatValue(baseline)}.`}
      preserveAspectRatio="xMidYMid meet"
    >
      {rows.map((r, i) => {
        const cy = 26 + i * 52;
        const w = Math.max(2, (r.value / maxV) * barMax);
        return (
          <g key={r.label}>
            <text x={padL - 10} y={cy + 18} fill={TEXT} fontSize="12" textAnchor="end">
              {r.label}
            </text>
            <rect x={padL} y={cy} width={w} height={24} rx="5" fill={r.color} opacity="0.85" />
            <text x={padL + w + 8} y={cy + 17} fill={TEXT_STRONG} fontSize="12">
              {formatValue(r.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) Distribuzione magnitudo — barre raggruppate per classe (attuale vs storico)
// ─────────────────────────────────────────────────────────────────────────────
export function MagnitudeDistributionChart(props: {
  current: MagnitudeBins;
  baseline: MagnitudeBins;
  labels: { m55: string; m60: string; m70: string; current: string; baseline: string };
  title: string;
}) {
  const { current, baseline, labels, title } = props;
  const W = 600;
  const H = 220;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 40;
  const classes = [
    { key: 'm55', label: labels.m55, cur: current.m55, base: baseline.m55 },
    { key: 'm60', label: labels.m60, cur: current.m60, base: baseline.m60 },
    { key: 'm70', label: labels.m70, cur: current.m70, base: baseline.m70 },
  ];
  const maxV = Math.max(...classes.flatMap((c) => [c.cur, c.base]), 1);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / classes.length;
  const y = (v: number) => padT + plotH - (v / maxV) * plotH;
  const ticks = [0, Math.round(maxV / 2), Math.ceil(maxV)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${title}. ${classes.map((c) => `${c.label}: ${labels.current} ${c.cur.toFixed(0)}, ${labels.baseline} ${c.base.toFixed(1)}`).join('; ')}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={padL} y1={y(tk)} x2={W - padR} y2={y(tk)} stroke={GRID} strokeWidth="1" />
          <text x={padL - 6} y={y(tk) + 4} fill={TEXT} fontSize="11" textAnchor="end">
            {tk}
          </text>
        </g>
      ))}
      {classes.map((c, i) => {
        const gx = padL + i * groupW;
        const bw = groupW * 0.3;
        const xCur = gx + groupW * 0.18;
        const xBase = gx + groupW * 0.52;
        return (
          <g key={c.key}>
            <rect x={xBase} y={y(c.base)} width={bw} height={padT + plotH - y(c.base)} rx="2" fill={HIST} />
            <rect x={xCur} y={y(c.cur)} width={bw} height={padT + plotH - y(c.cur)} rx="2" fill={CURRENT} />
            <text x={gx + groupW / 2} y={H - padB + 18} fill={TEXT} fontSize="11" textAnchor="middle">
              {c.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Legenda condivisa attuale/storico. */
export function ChartLegend(props: { current: string; baseline: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-space-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CURRENT }} />
        {props.current}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: HIST }} />
        {props.baseline}
      </span>
    </div>
  );
}
