/**
 * seismicStats.ts — statistica pura per la funzione "Anomalia Sismica".
 *
 * Tutte le funzioni sono pure e deterministiche (nessun I/O, nessuna dipendenza
 * dal tempo di sistema) → interamente testabili. La metodologia è deliberatamente
 * semplice, spiegabile e riproducibile:
 *
 *  - media / mediana / deviazione standard (di popolazione) della distribuzione
 *    storica di riferimento;
 *  - percentile EMPIRICO del valore corrente entro la distribuzione storica
 *    (metodo mid-rank), privilegiato rispetto allo z-score perché le distribuzioni
 *    dei conteggi sono tipicamente asimmetriche (right-skewed);
 *  - z-score fornito solo come informazione accessoria, NON come unico criterio;
 *  - energia sismica irradiata via relazione standard di Gutenberg–Richter.
 *
 * Nessuna funzione qui "prevede" terremoti: si limitano a confrontare un valore
 * osservato con una distribuzione storica.
 */

import { haversineKm } from '@/utils/geo';

// ─────────────────────────────────────────────────────────────────────────────
// Statistiche descrittive di base
// ─────────────────────────────────────────────────────────────────────────────

/** Media aritmetica. Ritorna NaN su array vuoto. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Mediana (interpolata tra i due centrali se n è pari). NaN su array vuoto. */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Deviazione standard di POPOLAZIONE (divisione per N). La distribuzione storica
 * di riferimento è trattata come popolazione nota: è l'insieme completo delle
 * finestre osservate, non un campione da inferire. NaN su array vuoto.
 */
export function standardDeviation(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / xs.length);
}

/**
 * Percentile empirico (0..100) del valore `value` entro `xs`, con metodo
 * mid-rank: (n_minori + 0.5 · n_uguali) / n · 100. Robusto a distribuzioni
 * discrete e asimmetriche. Ritorna NaN su array vuoto.
 */
export function percentileRank(xs: readonly number[], value: number): number {
  if (xs.length === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const x of xs) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  return ((below + 0.5 * equal) / xs.length) * 100;
}

/**
 * z-score = (value − media) / sd. Ritorna NaN se sd è 0 o non finito.
 * Fornito come informazione accessoria: NON è il criterio di classificazione
 * quando la distribuzione non è approssimativamente normale.
 */
export function zScore(value: number, meanValue: number, sd: number): number {
  if (!Number.isFinite(sd) || sd === 0) return NaN;
  return (value - meanValue) / sd;
}

/** Variazione percentuale del valore rispetto al riferimento. NaN se ref è 0. */
export function percentChange(value: number, reference: number): number {
  if (reference === 0) return NaN;
  return ((value - reference) / reference) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Energia sismica
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Energia sismica irradiata stimata (joule) da magnitudo, secondo la relazione
 * standard di Gutenberg–Richter:  log10(E) = 1.5·M + 4.8  →  E = 10^(1.5·M+4.8).
 * L'energia serve ESCLUSIVAMENTE a contestualizzare l'attività osservata (un
 * singolo grande sisma domina l'energia totale), mai come indicatore predittivo.
 */
export function magnitudeEnergyJoules(mag: number): number {
  return Math.pow(10, 1.5 * mag + 4.8);
}

/** Somma dell'energia stimata di un insieme di magnitudo (joule). */
export function totalEnergyJoules(mags: readonly number[]): number {
  let e = 0;
  for (const m of mags) e += magnitudeEnergyJoules(m);
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribuzione per classi di magnitudo
// ─────────────────────────────────────────────────────────────────────────────

export interface MagnitudeBins {
  /** 5.5 ≤ M < 6.0 */
  m55: number;
  /** 6.0 ≤ M < 7.0 */
  m60: number;
  /** M ≥ 7.0 */
  m70: number;
}

/** Ripartisce le magnitudo nelle tre classi indicative usate dalla UI. */
export function magnitudeBins(mags: readonly number[]): MagnitudeBins {
  const bins: MagnitudeBins = { m55: 0, m60: 0, m70: 0 };
  for (const m of mags) {
    if (m >= 7.0) bins.m70++;
    else if (m >= 6.0) bins.m60++;
    else if (m >= 5.5) bins.m55++;
  }
  return bins;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificazione dello scostamento dalla baseline
// ─────────────────────────────────────────────────────────────────────────────

export type DeviationLevel = 'normal' | 'above_average' | 'unusual' | 'insufficient';

export interface DeviationResult {
  level: DeviationLevel;
  /** Percentile empirico del valore corrente (0..100), NaN se insufficiente. */
  percentile: number;
  mean: number;
  median: number;
  sd: number;
  zScore: number;
  percentChange: number;
  /** Numero di campioni storici usati come riferimento. */
  sampleSize: number;
  /**
   * true quando i conteggi attesi sono molto bassi (es. M≥7 su 30 giorni):
   * la classificazione resta valida ma va letta con cautela perché un solo
   * evento in più sposta molto il percentile.
   */
  lowCountCaution: boolean;
}

/** Numero minimo di campioni storici per una classificazione robusta. */
export const MIN_BASELINE_SAMPLES = 20;
/** Percentile-soglia: sopra questo il valore è "superiore alla media". */
export const PCTL_ABOVE_AVERAGE = 85;
/** Percentile-soglia: sopra questo il valore è "statisticamente insolito". */
export const PCTL_UNUSUAL = 97.5;
/** Media attesa sotto la quale si attiva l'avviso di cautela per conteggi bassi. */
export const LOW_COUNT_MEAN = 2;

/**
 * Classifica il valore corrente rispetto alla distribuzione storica.
 *
 * Criterio (trasparente, basato sul percentile empirico):
 *   percentile < 85           → NELLA NORMA (entro la normale variabilità)
 *   85 ≤ percentile < 97.5    → SUPERIORE ALLA MEDIA (sopra la media, ma
 *                                compatibile con le oscillazioni storiche)
 *   percentile ≥ 97.5         → STATISTICAMENTE INSOLITO (oltre ~il 2.5%
 *                                superiore della distribuzione osservata)
 *   campioni < MIN_BASELINE   → DATI INSUFFICIENTI
 *
 * Il percentile è preferito allo z-score perché i conteggi sismici hanno
 * distribuzioni asimmetriche; lo z-score è comunque restituito come contesto.
 */
export function classifyDeviation(current: number, samples: readonly number[]): DeviationResult {
  const sampleSize = samples.length;
  const m = mean(samples);
  const md = median(samples);
  const sd = standardDeviation(samples);

  if (sampleSize < MIN_BASELINE_SAMPLES || !Number.isFinite(current)) {
    return {
      level: 'insufficient',
      percentile: NaN,
      mean: m,
      median: md,
      sd,
      zScore: NaN,
      percentChange: NaN,
      sampleSize,
      lowCountCaution: false,
    };
  }

  const p = percentileRank(samples, current);
  const z = zScore(current, m, sd);
  const pc = percentChange(current, m);

  let level: DeviationLevel;
  if (p >= PCTL_UNUSUAL) level = 'unusual';
  else if (p >= PCTL_ABOVE_AVERAGE) level = 'above_average';
  else level = 'normal';

  return {
    level,
    percentile: p,
    mean: m,
    median: md,
    sd,
    zScore: z,
    percentChange: pc,
    sampleSize,
    lowCountCaution: Number.isFinite(m) && m < LOW_COUNT_MEAN,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostica sequenze di aftershock (trasparente, NON altera i conteggi)
// ─────────────────────────────────────────────────────────────────────────────

export interface AftershockEvent {
  time: number; // epoch ms
  mag: number;
  lat: number;
  lon: number;
}

export interface AftershockDiagnostic {
  /** Frazione (0..1) di eventi vicini nel tempo/spazio all'evento maggiore. */
  clusteredFraction: number;
  /** Magnitudo dell'evento maggiore del periodo (NaN se nessun evento). */
  mainshockMag: number;
  /** true se una quota rilevante di eventi appare come possibile sequenza. */
  likelySequence: boolean;
  eventCount: number;
}

/** Finestra temporale (giorni) e spaziale (km) per la diagnostica aftershock. */
export const AFTERSHOCK_WINDOW_DAYS = 10;
export const AFTERSHOCK_RADIUS_KM = 350;
/** Sopra questa frazione si segnala una possibile sequenza dominante. */
export const AFTERSHOCK_FLAG_FRACTION = 0.4;

/**
 * Diagnostica NON distruttiva: individua l'evento maggiore e misura quale
 * frazione degli altri eventi cade entro AFTERSHOCK_WINDOW_DAYS giorni DOPO di
 * esso ed entro AFTERSHOCK_RADIUS_KM km. Serve solo a informare l'utente che i
 * conteggi possono essere temporaneamente gonfiati da una sequenza; NON rimuove
 * eventi né modifica alcuna statistica. È una euristica dichiarata, non un
 * declustering rigoroso.
 */
export function aftershockDiagnostic(events: readonly AftershockEvent[]): AftershockDiagnostic {
  const eventCount = events.length;
  if (eventCount === 0) {
    return { clusteredFraction: 0, mainshockMag: NaN, likelySequence: false, eventCount: 0 };
  }
  // Evento maggiore = mainshock candidato.
  let main = events[0];
  for (const e of events) if (e.mag > main.mag) main = e;

  const windowMs = AFTERSHOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let near = 0;
  let others = 0;
  for (const e of events) {
    if (e === main) continue;
    others++;
    const dt = e.time - main.time;
    if (dt > 0 && dt <= windowMs) {
      const dist = haversineKm(main.lat, main.lon, e.lat, e.lon);
      if (dist <= AFTERSHOCK_RADIUS_KM) near++;
    }
  }
  const clusteredFraction = others === 0 ? 0 : near / others;
  return {
    clusteredFraction,
    mainshockMag: main.mag,
    likelySequence: clusteredFraction >= AFTERSHOCK_FLAG_FRACTION,
    eventCount,
  };
}
