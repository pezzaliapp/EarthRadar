import { describe, expect, it } from 'vitest';
import {
  mean,
  median,
  standardDeviation,
  percentileRank,
  zScore,
  percentChange,
  magnitudeEnergyJoules,
  totalEnergyJoules,
  magnitudeBins,
  classifyDeviation,
  aftershockDiagnostic,
  MIN_BASELINE_SAMPLES,
  type AftershockEvent,
} from './seismicStats';

describe('mean', () => {
  it('computes the arithmetic mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([5])).toBe(5);
  });
  it('returns NaN on empty input', () => {
    expect(Number.isNaN(mean([]))).toBe(true);
  });
});

describe('median', () => {
  it('handles odd-length arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('interpolates even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('does not mutate the input', () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
  it('returns NaN on empty input', () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('standardDeviation (population)', () => {
  it('computes population SD', () => {
    // popolazione [2,4,4,4,5,5,7,9] → media 5, sd 2
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
  });
  it('is 0 for a constant array', () => {
    expect(standardDeviation([3, 3, 3])).toBe(0);
  });
  it('returns NaN on empty input', () => {
    expect(Number.isNaN(standardDeviation([]))).toBe(true);
  });
});

describe('percentileRank (mid-rank empirico)', () => {
  const xs = [10, 20, 30, 40, 50];
  it('mid-ranks a value present in the sample', () => {
    // 2 minori, 1 uguale → (2 + 0.5)/5 = 50%
    expect(percentileRank(xs, 30)).toBeCloseTo(50, 10);
  });
  it('is ~0 below the minimum and 100 above the max', () => {
    expect(percentileRank(xs, 5)).toBe(0);
    expect(percentileRank(xs, 100)).toBe(100);
  });
  it('handles ties correctly', () => {
    expect(percentileRank([5, 5, 5, 5], 5)).toBe(50);
  });
  it('returns NaN on empty input', () => {
    expect(Number.isNaN(percentileRank([], 1))).toBe(true);
  });
});

describe('zScore', () => {
  it('computes (value - mean) / sd', () => {
    expect(zScore(10, 4, 2)).toBe(3);
  });
  it('returns NaN when sd is 0', () => {
    expect(Number.isNaN(zScore(10, 4, 0))).toBe(true);
  });
});

describe('percentChange', () => {
  it('computes percent change vs reference', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
  it('returns NaN when reference is 0', () => {
    expect(Number.isNaN(percentChange(5, 0))).toBe(true);
  });
});

describe('magnitudeEnergyJoules (Gutenberg–Richter)', () => {
  it('follows E = 10^(1.5M + 4.8)', () => {
    expect(magnitudeEnergyJoules(6)).toBeCloseTo(Math.pow(10, 13.8), 2);
  });
  it('increases ~31.6x per magnitude unit', () => {
    const ratio = magnitudeEnergyJoules(7) / magnitudeEnergyJoules(6);
    expect(ratio).toBeCloseTo(Math.pow(10, 1.5), 6);
  });
  it('sums energy across events, dominated by the largest', () => {
    const total = totalEnergyJoules([9.1, 5.5, 5.5]);
    expect(total).toBeGreaterThan(magnitudeEnergyJoules(9.1));
    // il M9.1 domina: >99% dell'energia totale
    expect(magnitudeEnergyJoules(9.1) / total).toBeGreaterThan(0.99);
  });
  it('totalEnergyJoules is 0 for empty input', () => {
    expect(totalEnergyJoules([])).toBe(0);
  });
});

describe('magnitudeBins', () => {
  it('bins into 5.5–5.9, 6.0–6.9, ≥7.0', () => {
    expect(magnitudeBins([5.5, 5.9, 6.0, 6.9, 7.0, 8.2, 4.0])).toEqual({
      m55: 2,
      m60: 2,
      m70: 2,
    });
  });
  it('excludes sub-5.5 events', () => {
    expect(magnitudeBins([5.4, 3.0])).toEqual({ m55: 0, m60: 0, m70: 0 });
  });
  it('handles empty input', () => {
    expect(magnitudeBins([])).toEqual({ m55: 0, m60: 0, m70: 0 });
  });
});

describe('classifyDeviation', () => {
  // Distribuzione storica sintetica ampia e stabile.
  const baseline = Array.from({ length: 100 }, (_, i) => 20 + (i % 21)); // 20..40

  it('classifies a typical value as normal', () => {
    const r = classifyDeviation(28, baseline);
    expect(r.level).toBe('normal');
    expect(r.sampleSize).toBe(100);
    expect(Number.isFinite(r.percentile)).toBe(true);
  });

  it('classifies a high-but-plausible value as above_average', () => {
    // ~39 sta oltre l'85° percentile ma sotto il 97.5°
    const r = classifyDeviation(39, baseline);
    expect(r.level).toBe('above_average');
  });

  it('classifies an extreme value as unusual', () => {
    const r = classifyDeviation(500, baseline);
    expect(r.level).toBe('unusual');
    expect(r.percentile).toBe(100);
  });

  it('returns insufficient when baseline is too small', () => {
    const tiny = [10, 12, 11];
    expect(tiny.length).toBeLessThan(MIN_BASELINE_SAMPLES);
    const r = classifyDeviation(11, tiny);
    expect(r.level).toBe('insufficient');
    expect(Number.isNaN(r.percentile)).toBe(true);
  });

  it('returns insufficient when current is not finite', () => {
    const r = classifyDeviation(NaN, baseline);
    expect(r.level).toBe('insufficient');
  });

  it('flags lowCountCaution for very low expected counts (e.g. M≥7 / 30d)', () => {
    const lowCounts = Array.from({ length: 60 }, (_, i) => i % 3); // 0,1,2 → media 1
    const r = classifyDeviation(2, lowCounts);
    expect(r.lowCountCaution).toBe(true);
    // la classificazione resta comunque prodotta
    expect(['normal', 'above_average', 'unusual']).toContain(r.level);
  });

  it('does not flag caution for high-count distributions', () => {
    const r = classifyDeviation(28, baseline);
    expect(r.lowCountCaution).toBe(false);
  });

  it('reports mean, median, sd and percentChange', () => {
    const r = classifyDeviation(30, baseline);
    expect(r.mean).toBeCloseTo(30, 0);
    expect(Number.isFinite(r.sd)).toBe(true);
    expect(Number.isFinite(r.percentChange)).toBe(true);
  });
});

describe('aftershockDiagnostic', () => {
  const mk = (time: number, mag: number, lat: number, lon: number): AftershockEvent => ({
    time,
    mag,
    lat,
    lon,
  });
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = 1_600_000_000_000;

  it('handles empty input', () => {
    const d = aftershockDiagnostic([]);
    expect(d.eventCount).toBe(0);
    expect(d.likelySequence).toBe(false);
    expect(Number.isNaN(d.mainshockMag)).toBe(true);
  });

  it('handles a single event', () => {
    const d = aftershockDiagnostic([mk(t0, 7.5, 38, 142)]);
    expect(d.eventCount).toBe(1);
    expect(d.mainshockMag).toBe(7.5);
    expect(d.clusteredFraction).toBe(0);
    expect(d.likelySequence).toBe(false);
  });

  it('flags a dominant clustered sequence near the mainshock', () => {
    const events = [
      mk(t0, 8.0, 38, 142), // mainshock
      mk(t0 + 1 * DAY, 6.0, 38.2, 142.1),
      mk(t0 + 2 * DAY, 5.8, 37.9, 141.8),
      mk(t0 + 3 * DAY, 6.1, 38.1, 142.3),
    ];
    const d = aftershockDiagnostic(events);
    expect(d.mainshockMag).toBe(8.0);
    expect(d.clusteredFraction).toBeCloseTo(1, 10);
    expect(d.likelySequence).toBe(true);
  });

  it('does NOT flag spatially/temporally scattered events', () => {
    const events = [
      mk(t0, 7.0, 38, 142), // Giappone
      mk(t0 + 1 * DAY, 6.5, -33, -70), // Cile (lontano)
      mk(t0 + 200 * DAY, 6.2, 37, 141), // stesso posto ma mesi dopo
    ];
    const d = aftershockDiagnostic(events);
    expect(d.likelySequence).toBe(false);
    expect(d.clusteredFraction).toBeLessThan(0.4);
  });

  it('never removes events (count is preserved)', () => {
    const events = [mk(t0, 8.0, 38, 142), mk(t0 + DAY, 6.0, 38, 142)];
    const d = aftershockDiagnostic(events);
    expect(d.eventCount).toBe(events.length);
  });
});
