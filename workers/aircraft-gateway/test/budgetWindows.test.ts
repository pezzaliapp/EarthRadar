// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ADAPTIVE_TTL_STEPS, CACHE_FRESH_TTL_S, UPSTREAM_BUDGET } from '../src/config.ts';
import { BudgetLedger, type BudgetLimits } from '../src/budget/ledger.ts';
import { MemoryLedgerStore } from './budgetHarness.ts';

/**
 * Consumo massimo in QUALUNQUE finestra mobile (non allineata a ore, giorni o
 * mesi), calcolato esattamente sui singoli istanti dei permessi concessi.
 * Limiti del provider: 30/min, 300.000/mese (comunque definito: 28–31 giorni
 * di calendario o 30 giorni mobili).
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Un istante NON allineato all'ora: le finestre mobili non devono dipendere dall'allineamento. */
const T0 = Date.UTC(2026, 9, 27, 0, 0, 0) + 37 * MINUTE + 13_457;

function newLedger(store: MemoryLedgerStore, limits: BudgetLimits = UPSTREAM_BUDGET) {
  return new BudgetLedger({
    limits,
    baseTtlS: CACHE_FRESH_TTL_S,
    adaptive: ADAPTIVE_TTL_STEPS,
    pauseMinMs: 10_000,
    pauseMaxMs: 300_000,
    store,
  });
}

/** Massimo di eventi in una finestra semiaperta [t, t + windowMs). `times` ordinati. */
function maxInWindow(times: readonly number[], windowMs: number): number {
  let max = 0;
  let lo = 0;
  for (let hi = 0; hi < times.length; hi += 1) {
    while (times[hi]! - times[lo]! >= windowMs) lo += 1;
    max = Math.max(max, hi - lo + 1);
  }
  return max;
}

interface RunOptions {
  limits?: BudgetLimits;
  days: number;
  /** Prossimo tentativo dopo un permesso concesso (default: subito dopo, 1 ms). */
  afterGrant?: (t: number) => number;
  /** Prossimo tentativo dopo un rifiuto (default: esattamente allo scadere di Retry-After). */
  afterDeny?: (t: number, retryAfterMs: number) => number;
  /** Riavvio del Durable Object ogni N ms (stato riletto dallo store). */
  restartEveryMs?: number;
}

/** Cliente avversario: chiede il massimo possibile, rispettando solo i Retry-After. */
function run(opts: RunOptions): number[] {
  const store = new MemoryLedgerStore();
  let ledger = newLedger(store, opts.limits);
  const granted: number[] = [];
  const end = T0 + opts.days * DAY;
  let nextRestart = opts.restartEveryMs ? T0 + opts.restartEveryMs : Infinity;
  let t = T0;
  while (t < end) {
    if (t >= nextRestart) {
      ledger = newLedger(store, opts.limits);
      nextRestart += opts.restartEveryMs!;
    }
    const d = ledger.acquire(t);
    const prev = t;
    if (d.kind === 'granted') {
      granted.push(t);
      t = opts.afterGrant ? opts.afterGrant(t) : t + 1;
    } else {
      t = opts.afterDeny ? opts.afterDeny(t, d.retryAfterMs) : t + d.retryAfterMs;
    }
    if (t <= prev) throw new Error('scenario di test non valido: il tempo deve avanzare');
  }
  return granted;
}

function expectWithinProviderLimits(granted: number[], limits: BudgetLimits = UPSTREAM_BUDGET) {
  expect(maxInWindow(granted, 10 * SECOND)).toBeLessThanOrEqual(limits.perTenSeconds);
  expect(maxInWindow(granted, MINUTE)).toBeLessThanOrEqual(limits.perMinute);
  expect(maxInWindow(granted, DAY)).toBeLessThanOrEqual(limits.perDay);
  expect(maxInWindow(granted, 30 * DAY)).toBeLessThanOrEqual(limits.perThirtyDays);
  expect(maxInWindow(granted, 31 * DAY)).toBeLessThanOrEqual(limits.perThirtyDays + limits.perDay);
}

describe('finestre di 30 e 31 giorni — scala reale (limiti di config.ts)', () => {
  it('cliente avversario al massimo ritmo per 65 giorni: limiti rispettati in ogni finestra', () => {
    const granted = run({ days: 65 });
    expectWithinProviderLimits(granted);
    // Valori assoluti richiesti dal provider.
    expect(maxInWindow(granted, MINUTE)).toBeLessThan(30);
    expect(maxInWindow(granted, 30 * DAY)).toBeLessThanOrEqual(285_000);
    expect(maxInWindow(granted, 31 * DAY)).toBeLessThanOrEqual(294_500);
    expect(maxInWindow(granted, 31 * DAY)).toBeLessThan(300_000);
    // Il budget è usato davvero (non un limite finto a zero): ≥ 90% del tetto mensile.
    expect(maxInWindow(granted, 30 * DAY)).toBeGreaterThan(0.9 * 285_000);
  }, 120_000);

  it('ogni mese di calendario (28, 29, 30, 31 giorni) sotto 300.000', () => {
    const granted = run({ days: 65 });
    // Finestre allineate a mezzanotte UTC di lunghezza 28..31 giorni, a ogni giorno di partenza.
    const startDay = Math.ceil(T0 / DAY) * DAY;
    for (let start = startDay; start + 31 * DAY <= T0 + 65 * DAY; start += DAY) {
      for (const len of [28, 29, 30, 31]) {
        const n = granted.filter((t) => t >= start && t < start + len * DAY).length;
        expect(n).toBeLessThan(300_000);
      }
    }
  }, 120_000);
});

describe('finestre di 30 e 31 giorni — casi limite (limiti ridotti, stessa logica)', () => {
  // Proporzioni reali ridotte di 100× per esplorare molti scenari.
  const small: BudgetLimits = { perTenSeconds: 4, perMinute: 24, perDay: 95, perThirtyDays: 2_850 };

  it('raffiche a cavallo dei confini d’ora (ultimo secondo / primo secondo)', () => {
    const granted = run({
      limits: small,
      days: 70,
      afterGrant: (t) => t + 1,
      // Dopo un rifiuto: aspetta il prossimo "ultimo secondo" o "primo secondo" di un'ora.
      afterDeny: (t, retry) => {
        const target = t + retry;
        const h = Math.floor(target / HOUR) * HOUR;
        const candidates = [h + HOUR - SECOND, h + HOUR, h + 2 * HOUR - SECOND].filter(
          (c) => c >= target,
        );
        return Math.min(...candidates);
      },
    });
    expectWithinProviderLimits(granted, small);
  });

  it('a cavallo della mezzanotte UTC e dei cambi di mese', () => {
    const granted = run({
      limits: small,
      days: 70,
      afterDeny: (t, retry) => {
        const target = t + retry;
        const midnight = Math.ceil(target / DAY) * DAY;
        // Insiste a ridosso della mezzanotte, poi riprova appena possibile.
        const nearMidnight = midnight - SECOND;
        return midnight - target < 2 * HOUR && nearMidnight > target ? nearMidnight : target;
      },
    });
    expectWithinProviderLimits(granted, small);
  });

  it('29 giorni di silenzio dopo una raffica, poi di nuovo al massimo', () => {
    const granted = run({
      limits: small,
      days: 75,
      afterDeny: (t, retry) => {
        const target = t + retry;
        // Fra il giorno 1 e il giorno 30 il cliente tace del tutto.
        const resume = T0 + 30 * DAY - 7 * MINUTE;
        if (target > T0 + DAY && target < resume) return resume;
        return target;
      },
    });
    expectWithinProviderLimits(granted, small);
  });

  it('riavvii frequenti del Durable Object: lo stato persistito mantiene i limiti', () => {
    const granted = run({ limits: small, days: 65, restartEveryMs: 97 * MINUTE });
    expectWithinProviderLimits(granted, small);
  });

  it('tentativi ostinati (ogni 250 ms, ignorando Retry-After)', () => {
    const tiny: BudgetLimits = {
      perTenSeconds: 4,
      perMinute: 24,
      perDay: 40,
      perThirtyDays: 1_000,
    };
    const granted = run({
      limits: tiny,
      days: 35,
      afterGrant: (t) => t + 250,
      // Ignora Retry-After entro la stessa ora (stress sui confini), poi salta avanti.
      afterDeny: (t, retry) => (retry < 5 * MINUTE ? t + 250 : t + retry),
    });
    expectWithinProviderLimits(granted, tiny);
  });

  it('confine esatto dei 30 giorni: il primo permesso libera il posto solo a ora intera passata', () => {
    const limits: BudgetLimits = {
      perTenSeconds: 1e9,
      perMinute: 1e9,
      perDay: 1e9,
      perThirtyDays: 3,
    };
    const store = new MemoryLedgerStore();
    const l = newLedger(store, limits);
    expect(l.acquire(T0).kind).toBe('granted');
    expect(l.acquire(T0 + 10 * DAY).kind).toBe('granted');
    expect(l.acquire(T0 + 20 * DAY).kind).toBe('granted');
    // A 30 giorni esatti dal primo: ancora negato (l'ora del primo permesso è contata intera).
    expect(l.acquire(T0 + 30 * DAY).kind).toBe('denied');
    const releaseAt = (Math.floor(T0 / HOUR) + 721) * HOUR;
    expect(l.acquire(releaseAt - 1).kind).toBe('denied');
    expect(l.acquire(releaseAt).kind).toBe('granted');
    // Mai 4 permessi in 30 giorni (e quindi nemmeno oltre il limite in 31).
    const times = [T0, T0 + 10 * DAY, T0 + 20 * DAY, releaseAt];
    expect(maxInWindow(times, 30 * DAY)).toBeLessThanOrEqual(3);
  });

  it('orologio che torna indietro: i permessi "futuri" restano contati', () => {
    const limits: BudgetLimits = {
      perTenSeconds: 1e9,
      perMinute: 3,
      perDay: 5,
      perThirtyDays: 1e9,
    };
    const l = newLedger(new MemoryLedgerStore(), limits);
    for (let i = 0; i < 5; i += 1)
      expect(l.acquire(T0 + 3 * HOUR + i * MINUTE).kind).toBe('granted');
    // Lo stesso Durable Object vede l'orologio indietro di 2 ore: nessun nuovo spazio.
    expect(l.acquire(T0 + HOUR).kind).toBe('denied');
    const back = newLedger(new MemoryLedgerStore(), limits);
    for (let i = 0; i < 3; i += 1) back.acquire(T0 + 10 * SECOND + i);
    expect(back.acquire(T0).kind).toBe('denied');
  });
});
