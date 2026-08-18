/**
 * seismicAnalysis.ts — combina la baseline storica pre-calcolata con gli eventi
 * recenti (query live USGS) e produce l'oggetto di analisi consumato dalla UI.
 *
 * È puro e deterministico: riceve `now` come parametro (nessun accesso diretto
 * all'orologio) → completamente testabile. Non "prevede" nulla: filtra, conta,
 * confronta con la distribuzione storica.
 */

import {
  classifyDeviation,
  magnitudeBins,
  totalEnergyJoules,
  aftershockDiagnostic,
  type DeviationResult,
  type MagnitudeBins,
  type AftershockDiagnostic,
} from './seismicStats';

export type SeismicThreshold = 5.5 | 6.0 | 7.0;
export type SeismicWindowDays = 30 | 60 | 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

/** Evento sismico minimale usato dall'analisi. */
export interface SeismicEvent {
  time: number; // epoch ms
  mag: number;
  lat: number;
  lon: number;
  place: string;
}

/** Struttura della baseline pre-calcolata (`public/data/seismic-baseline.json`). */
export interface SeismicBaseline {
  meta: {
    source: string;
    endpoint: string;
    generatedAt: string;
    baselineStart: string;
    baselineEnd: string;
    thresholds: number[];
    windowsDays: number[];
    windowStepDays: number;
    energyFormula: string;
    energyUnit: string;
    declustering: string;
    exclusions: string;
    totalEventsBaseMag: number;
    baseMinMagnitude: number;
    methodology: string;
    license: string;
    attribution: string;
    reproduce: string;
  };
  annual: Record<string, Record<string, { count: number; energyJoules: number }>>;
  windows: Record<string, Record<string, number[]>>;
}

export interface AnnualPoint {
  year: number;
  count: number;
  energyJoules: number;
}

export interface AnomalyAnalysis {
  windowDays: SeismicWindowDays;
  threshold: SeismicThreshold;
  /** Numero di eventi ≥ soglia nella finestra corrente. */
  currentCount: number;
  /** Energia sismica stimata nella finestra corrente (joule). */
  currentEnergyJoules: number;
  /** Energia media storica per una finestra equivalente (joule). */
  baselineWindowEnergyMean: number;
  /** Classificazione dello scostamento + statistiche descrittive. */
  deviation: DeviationResult;
  /** Campioni storici (conteggi per finestra) usati come riferimento. */
  baselineSamples: number[];
  /** Serie storica annuale per la soglia selezionata. */
  annual: AnnualPoint[];
  /** Distribuzione per classe di magnitudo nella finestra corrente (M≥5.5). */
  currentBins: MagnitudeBins;
  /** Distribuzione media storica per classe, scalata alla finestra. */
  baselineBins: MagnitudeBins;
  /** Diagnostica (non distruttiva) di possibili sequenze di aftershock. */
  aftershock: AftershockDiagnostic;
  /** Istante di riferimento usato per la finestra (epoch ms). */
  now: number;
  /** Numero eventi M≥5.5 nella finestra (contesto per la distribuzione). */
  windowBaseCount: number;
}

function thrKey(t: SeismicThreshold): string {
  return t.toFixed(1);
}

/** Filtra gli eventi entro `windowDays` da `now` e con mag ≥ soglia. */
export function filterWindow(
  events: readonly SeismicEvent[],
  now: number,
  windowDays: number,
  minMag: number,
): SeismicEvent[] {
  const from = now - windowDays * DAY_MS;
  return events.filter((e) => e.time >= from && e.time <= now && e.mag >= minMag);
}

/**
 * Media storica del conteggio annuale per una data classe (derivata dalla
 * differenza tra soglie), scalata alla lunghezza della finestra.
 */
function classWindowAverage(
  baseline: SeismicBaseline,
  lowKey: string,
  highKey: string | null,
  windowDays: number,
): number {
  const low = baseline.annual[lowKey];
  const high = highKey ? baseline.annual[highKey] : null;
  if (!low) return 0;
  const years = Object.keys(low);
  if (years.length === 0) return 0;
  let sum = 0;
  for (const y of years) {
    const c = low[y].count - (high ? (high[y]?.count ?? 0) : 0);
    sum += c;
  }
  const annualMean = sum / years.length;
  return annualMean * (windowDays / DAYS_PER_YEAR);
}

/**
 * Calcola l'analisi completa dell'anomalia sismica per la finestra e la soglia
 * selezionate. `events` sono gli eventi recenti M≥5.5 (superset) su cui filtrare.
 */
export function computeAnomalyAnalysis(params: {
  baseline: SeismicBaseline;
  events: readonly SeismicEvent[];
  windowDays: SeismicWindowDays;
  threshold: SeismicThreshold;
  now: number;
}): AnomalyAnalysis {
  const { baseline, events, windowDays, threshold, now } = params;

  // Finestra corrente al livello di soglia selezionato.
  const windowEvents = filterWindow(events, now, windowDays, threshold);
  const currentCount = windowEvents.length;
  const currentEnergyJoules = totalEnergyJoules(windowEvents.map((e) => e.mag));

  // Finestra corrente al livello base (M≥5.5) — contesto per la distribuzione.
  const windowBaseEvents = filterWindow(events, now, windowDays, 5.5);
  const currentBins = magnitudeBins(windowBaseEvents.map((e) => e.mag));

  // Distribuzione storica di riferimento per (finestra, soglia).
  const samples = baseline.windows[String(windowDays)]?.[thrKey(threshold)] ?? [];
  const deviation = classifyDeviation(currentCount, samples);

  // Serie storica annuale per la soglia.
  const annualRecord = baseline.annual[thrKey(threshold)] ?? {};
  const annual: AnnualPoint[] = Object.keys(annualRecord)
    .map((y) => ({
      year: Number(y),
      count: annualRecord[y].count,
      energyJoules: annualRecord[y].energyJoules,
    }))
    .sort((a, b) => a.year - b.year);

  // Energia media storica per finestra equivalente (contesto, non predittivo).
  const meanAnnualEnergy =
    annual.length > 0 ? annual.reduce((s, p) => s + p.energyJoules, 0) / annual.length : 0;
  const baselineWindowEnergyMean = meanAnnualEnergy * (windowDays / DAYS_PER_YEAR);

  // Medie storiche per classe di magnitudo, scalate alla finestra.
  const baselineBins: MagnitudeBins = {
    m55: classWindowAverage(baseline, '5.5', '6.0', windowDays),
    m60: classWindowAverage(baseline, '6.0', '7.0', windowDays),
    m70: classWindowAverage(baseline, '7.0', null, windowDays),
  };

  // Diagnostica aftershock sugli eventi analizzati (≥ soglia).
  const aftershock = aftershockDiagnostic(
    windowEvents.map((e) => ({ time: e.time, mag: e.mag, lat: e.lat, lon: e.lon })),
  );

  return {
    windowDays,
    threshold,
    currentCount,
    currentEnergyJoules,
    baselineWindowEnergyMean,
    deviation,
    baselineSamples: samples,
    annual,
    currentBins,
    baselineBins,
    aftershock,
    now,
    windowBaseCount: windowBaseEvents.length,
  };
}
