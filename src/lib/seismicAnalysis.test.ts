import { describe, expect, it } from 'vitest';
import {
  filterWindow,
  computeAnomalyAnalysis,
  type SeismicBaseline,
  type SeismicEvent,
} from './seismicAnalysis';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2025-06-01T00:00:00Z');

/** Baseline sintetica minima ma valida (≥20 campioni per non essere "insufficiente"). */
function makeBaseline(): SeismicBaseline {
  const samples30 = Array.from({ length: 40 }, (_, i) => 30 + (i % 11)); // 30..40
  const samples60 = Array.from({ length: 40 }, (_, i) => 60 + (i % 11));
  const samples90 = Array.from({ length: 40 }, (_, i) => 90 + (i % 11));
  const lowSamples = Array.from({ length: 40 }, (_, i) => i % 3); // 0,1,2 (M≥7 tipo)
  return {
    meta: {
      source: 'test',
      endpoint: 'test',
      generatedAt: '2025-01-01T00:00:00Z',
      baselineStart: '2006-01-01',
      baselineEnd: '2008-12-31',
      thresholds: [5.5, 6.0, 7.0],
      windowsDays: [30, 60, 90],
      windowStepDays: 30,
      energyFormula: 'E = 10^(1.5M+4.8)',
      energyUnit: 'joule',
      declustering: 'nessuno',
      exclusions: 'nessuna',
      totalEventsBaseMag: 3000,
      baseMinMagnitude: 5.5,
      methodology: 'test',
      license: 'USGS public domain',
      attribution: 'USGS',
      reproduce: 'node scripts/generateSeismicBaseline.mjs',
    },
    annual: {
      '5.5': {
        '2006': { count: 500, energyJoules: 1e17 },
        '2007': { count: 520, energyJoules: 1.2e17 },
        '2008': { count: 480, energyJoules: 1.1e17 },
      },
      '6.0': {
        '2006': { count: 150, energyJoules: 9e16 },
        '2007': { count: 160, energyJoules: 1e17 },
        '2008': { count: 140, energyJoules: 9.5e16 },
      },
      '7.0': {
        '2006': { count: 15, energyJoules: 8e16 },
        '2007': { count: 18, energyJoules: 9e16 },
        '2008': { count: 12, energyJoules: 8.5e16 },
      },
    },
    windows: {
      '30': { '5.5': samples30, '6.0': samples30, '7.0': lowSamples },
      '60': { '5.5': samples60, '6.0': samples60, '7.0': lowSamples },
      '90': { '5.5': samples90, '6.0': samples90, '7.0': lowSamples },
    },
  };
}

/** Eventi a tempi/magnitudo noti rispetto a NOW. */
function makeEvents(): SeismicEvent[] {
  return [
    { time: NOW - 5 * DAY, mag: 7.2, lat: 38, lon: 142, place: 'A' }, // in 30d, ≥7
    { time: NOW - 10 * DAY, mag: 6.1, lat: 38.1, lon: 142.1, place: 'B' }, // in 30d, ≥6
    { time: NOW - 20 * DAY, mag: 5.6, lat: 10, lon: 20, place: 'C' }, // in 30d, ≥5.5
    { time: NOW - 45 * DAY, mag: 6.4, lat: -10, lon: -70, place: 'D' }, // in 60/90d, ≥6
    { time: NOW - 80 * DAY, mag: 5.8, lat: 0, lon: 0, place: 'E' }, // in 90d, ≥5.5
    { time: NOW - 200 * DAY, mag: 8.0, lat: 1, lon: 1, place: 'F' }, // fuori finestra
  ];
}

describe('filterWindow', () => {
  it('keeps events within the window and above the threshold', () => {
    const ev = makeEvents();
    const w = filterWindow(ev, NOW, 30, 5.5);
    expect(w).toHaveLength(3); // 7.2, 6.1, 5.6
  });
  it('applies the magnitude threshold', () => {
    const ev = makeEvents();
    expect(filterWindow(ev, NOW, 30, 7.0)).toHaveLength(1);
    expect(filterWindow(ev, NOW, 90, 6.0)).toHaveLength(3); // 7.2, 6.1, 6.4
  });
  it('excludes events older than the window and future events', () => {
    const ev = makeEvents();
    expect(filterWindow(ev, NOW, 90, 5.5)).toHaveLength(5); // esclude il -200d
    const withFuture = [...ev, { time: NOW + DAY, mag: 9, lat: 0, lon: 0, place: 'Z' }];
    expect(filterWindow(withFuture, NOW, 90, 5.5)).toHaveLength(5);
  });
});

describe('computeAnomalyAnalysis', () => {
  const baseline = makeBaseline();
  const events = makeEvents();

  it('counts current events for the selected window/threshold', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 5.5, now: NOW });
    expect(a.currentCount).toBe(3);
    expect(a.windowBaseCount).toBe(3);
  });

  it('separates thresholds correctly', () => {
    const a7 = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 7.0, now: NOW });
    expect(a7.currentCount).toBe(1);
    const a6 = computeAnomalyAnalysis({ baseline, events, windowDays: 90, threshold: 6.0, now: NOW });
    expect(a6.currentCount).toBe(3);
  });

  it('computes current energy dominated by the largest event', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 5.5, now: NOW });
    expect(a.currentEnergyJoules).toBeGreaterThan(0);
    // il M7.2 domina l'energia della finestra
    const m72 = Math.pow(10, 1.5 * 7.2 + 4.8);
    expect(m72 / a.currentEnergyJoules).toBeGreaterThan(0.9);
  });

  it('classifies a typical count as normal', () => {
    // currentCount 3 con baseline 90..100 → sotto la distribuzione → normal
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 90, threshold: 5.5, now: NOW });
    expect(a.deviation.level).toBe('normal');
  });

  it('classifies an extreme count as unusual', () => {
    // Inietta molti eventi ≥5.5 in 30 giorni → sopra la baseline 30..40.
    const many: SeismicEvent[] = Array.from({ length: 200 }, (_, i) => ({
      time: NOW - (i % 29) * DAY,
      mag: 5.6,
      lat: i,
      lon: i,
      place: `x${i}`,
    }));
    const a = computeAnomalyAnalysis({ baseline, events: many, windowDays: 30, threshold: 5.5, now: NOW });
    expect(a.currentCount).toBe(200);
    expect(a.deviation.level).toBe('unusual');
  });

  it('flags lowCountCaution for the M≥7 threshold', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 7.0, now: NOW });
    expect(a.deviation.lowCountCaution).toBe(true);
  });

  it('returns a sorted annual series for the threshold', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 7.0, now: NOW });
    expect(a.annual.map((p) => p.year)).toEqual([2006, 2007, 2008]);
    expect(a.annual[0].count).toBe(15);
  });

  it('computes current and baseline magnitude bins', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 5.5, now: NOW });
    // finestra 30d M≥5.5: uno 7.2, uno 6.1, uno 5.6
    expect(a.currentBins).toEqual({ m55: 1, m60: 1, m70: 1 });
    expect(a.baselineBins.m55).toBeGreaterThan(0);
    expect(a.baselineBins.m70).toBeGreaterThan(0);
  });

  it('provides baseline window energy mean > 0', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 90, threshold: 6.0, now: NOW });
    expect(a.baselineWindowEnergyMean).toBeGreaterThan(0);
  });

  it('runs the aftershock diagnostic on the analyzed set', () => {
    const a = computeAnomalyAnalysis({ baseline, events, windowDays: 30, threshold: 5.5, now: NOW });
    expect(a.aftershock.eventCount).toBe(3);
    expect(a.aftershock.mainshockMag).toBe(7.2);
  });

  it('handles an empty event set without throwing', () => {
    const a = computeAnomalyAnalysis({ baseline, events: [], windowDays: 60, threshold: 6.0, now: NOW });
    expect(a.currentCount).toBe(0);
    expect(a.currentEnergyJoules).toBe(0);
    expect(a.currentBins).toEqual({ m55: 0, m60: 0, m70: 0 });
    // baseline presente → classificazione prodotta (0 eventi è "normal" o simile, non insufficient)
    expect(a.deviation.level).not.toBe('insufficient');
  });

  it('returns insufficient when the baseline lacks samples for the combo', () => {
    const sparse = makeBaseline();
    sparse.windows['30']['6.0'] = [1, 2]; // < MIN_BASELINE_SAMPLES
    const a = computeAnomalyAnalysis({ baseline: sparse, events, windowDays: 30, threshold: 6.0, now: NOW });
    expect(a.deviation.level).toBe('insufficient');
  });
});
