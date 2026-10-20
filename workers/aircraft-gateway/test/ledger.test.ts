// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ADAPTIVE_TTL_STEPS, CACHE_FRESH_TTL_S, UPSTREAM_BUDGET } from '../src/config.ts';
import { BudgetLedger, type BudgetLimits, type LedgerStore } from '../src/budget/ledger.ts';
import { SqlLedgerStore } from '../src/budget/sqlStore.ts';
import { MemoryLedgerStore, openNodeSql } from './budgetHarness.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = 1_790_510_000_000;

function ledger(store: LedgerStore, limits: BudgetLimits = UPSTREAM_BUDGET) {
  return new BudgetLedger({
    limits,
    baseTtlS: CACHE_FRESH_TTL_S,
    adaptive: ADAPTIVE_TTL_STEPS,
    pauseMinMs: 10_000,
    pauseMaxMs: 300_000,
    store,
  });
}

/** Massimo numero di permessi in una qualunque finestra (aperta a sinistra) di `windowMs`. */
function maxInWindow(times: number[], windowMs: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  let max = 0;
  let lo = 0;
  for (let hi = 0; hi < sorted.length; hi += 1) {
    while (sorted[hi]! - sorted[lo]! >= windowMs) lo += 1;
    max = Math.max(max, hi - lo + 1);
  }
  return max;
}

describe('BudgetLedger — finestre brevi', () => {
  it('limiti di config coerenti con FlyItalyADSB (30/min, 300.000/mese)', () => {
    expect(UPSTREAM_BUDGET.perMinute).toBe(24);
    expect(UPSTREAM_BUDGET.perMinute).toBeLessThan(30);
    // Qualunque periodo di 31 giorni: 30 giorni + 24 h.
    expect(UPSTREAM_BUDGET.perThirtyDays + UPSTREAM_BUDGET.perDay).toBeLessThan(300_000);
    expect(UPSTREAM_BUDGET.perDay * 30).toBeGreaterThanOrEqual(UPSTREAM_BUDGET.perThirtyDays);
  });

  it('raffica: al massimo 4 permessi in 10 s, poi rifiuto con attesa esatta', () => {
    const l = ledger(new MemoryLedgerStore());
    for (let i = 0; i < 4; i += 1) expect(l.acquire(T0 + i).kind).toBe('granted');
    const d = l.acquire(T0 + 4);
    expect(d).toMatchObject({ kind: 'denied', scope: 'ten_seconds', retryAfterMs: 10_000 - 4 });
    expect(l.acquire(T0 + 10_000).kind).toBe('granted');
  });

  it('24 per minuto su finestra MOBILE, non allineata al minuto di calendario', () => {
    const l = ledger(new MemoryLedgerStore());
    const granted: number[] = [];
    // Una richiesta ogni 500 ms per 5 minuti, a cavallo dei confini di minuto.
    const start = T0 + 59_000;
    for (let t = start; t < start + 5 * 60_000; t += 500) {
      if (l.acquire(t).kind === 'granted') granted.push(t);
    }
    expect(maxInWindow(granted, 60_000)).toBeLessThanOrEqual(24);
    expect(maxInWindow(granted, 10_000)).toBeLessThanOrEqual(4);
    // E nessun minuto di calendario oltre 24.
    const perCalendarMinute = new Map<number, number>();
    for (const t of granted) {
      const m = Math.floor(t / 60_000);
      perCalendarMinute.set(m, (perCalendarMinute.get(m) ?? 0) + 1);
    }
    expect(Math.max(...perCalendarMinute.values())).toBeLessThanOrEqual(24);
    // Il budget viene usato davvero: ~24 al minuto.
    expect(granted.length).toBeGreaterThanOrEqual(5 * 24 - 1);
  });

  it('rifiuto al minuto: attesa fino all’uscita del permesso più vecchio', () => {
    // Senza limite a 10 s, per isolare la finestra di 60 s.
    const l = ledger(new MemoryLedgerStore(), { ...UPSTREAM_BUDGET, perTenSeconds: 1e9 });
    for (let i = 0; i < 24; i += 1) expect(l.acquire(T0 + i * 2_500).kind).toBe('granted');
    const now = T0 + 23 * 2_500 + 1_000;
    const d = l.acquire(now);
    expect(d).toMatchObject({ kind: 'denied', scope: 'minute' });
    if (d.kind !== 'denied') throw new Error('atteso rifiuto');
    expect(now + d.retryAfterMs).toBe(T0 + 60_000);
    expect(l.acquire(now + d.retryAfterMs).kind).toBe('granted');
  });
});

describe('BudgetLedger — giorno e 30 giorni mobili', () => {
  const big = { perTenSeconds: 1e9, perMinute: 1e9 };

  it('limite su 24 h mobili, non sul giorno di calendario', () => {
    const l = ledger(new MemoryLedgerStore(), { ...big, perDay: 10, perThirtyDays: 1e9 });
    // 10 permessi alle 23:00 UTC…
    const lateEvening = Math.floor(T0 / DAY) * DAY + 23 * HOUR;
    for (let i = 0; i < 10; i += 1) expect(l.acquire(lateEvening + i).kind).toBe('granted');
    // …a mezzanotte il giorno di calendario cambia, la finestra mobile no.
    const d = l.acquire(lateEvening + 2 * HOUR);
    expect(d).toMatchObject({ kind: 'denied', scope: 'day' });
    if (d.kind !== 'denied') throw new Error('atteso rifiuto');
    // Libero solo quando l'ora delle 23:00 esce del tutto dalla finestra (per eccesso).
    expect(lateEvening + 2 * HOUR + d.retryAfterMs).toBe(lateEvening + 25 * HOUR);
    expect(l.acquire(lateEvening + 25 * HOUR - 1).kind).toBe('denied');
    expect(l.acquire(lateEvening + 25 * HOUR).kind).toBe('granted');
  });

  it('limite su 30 giorni mobili, indipendente dal mese di calendario', () => {
    const l = ledger(new MemoryLedgerStore(), { ...big, perDay: 1e9, perThirtyDays: 30 });
    // Un permesso al giorno per 30 giorni.
    for (let d = 0; d < 30; d += 1) expect(l.acquire(T0 + d * DAY).kind).toBe('granted');
    expect(l.acquire(T0 + 30 * DAY - HOUR)).toMatchObject({ kind: 'denied', scope: 'thirty_days' });
    // Il primo permesso esce dalla finestra (ora intera inclusa) dopo 30 giorni + 1 ora.
    const firstHourEnd = (Math.floor(T0 / HOUR) + 721) * HOUR;
    expect(l.acquire(firstHourEnd - 1).kind).toBe('denied');
    expect(l.acquire(firstHourEnd).kind).toBe('granted');
  });

  it('simulazione 40 giorni al massimo ritmo: nessun periodo di 31 giorni oltre 294.500', () => {
    // Ritmo massimo consentito, simulato a passi di 60 s con 24 richieste (no raffiche).
    const store = new MemoryLedgerStore();
    const l = ledger(store, {
      perTenSeconds: 1e9,
      perMinute: 24,
      perDay: 9_500,
      perThirtyDays: 285_000,
    });
    const perDay: number[] = [];
    for (let day = 0; day < 40; day += 1) {
      let n = 0;
      for (let m = 0; m < 1440; m += 1) {
        const t = T0 + day * DAY + m * 60_000;
        for (let k = 0; k < 24; k += 1) {
          if (l.acquire(t + k).kind !== 'granted') break;
          n += 1;
        }
      }
      perDay.push(n);
    }
    for (const n of perDay) expect(n).toBeLessThanOrEqual(9_500);
    for (let i = 0; i + 31 <= perDay.length; i += 1) {
      const sum = perDay.slice(i, i + 31).reduce((a, b) => a + b, 0);
      expect(sum).toBeLessThanOrEqual(294_500);
    }
    for (let i = 0; i + 30 <= perDay.length; i += 1) {
      const sum = perDay.slice(i, i + 30).reduce((a, b) => a + b, 0);
      expect(sum).toBeLessThanOrEqual(285_000);
    }
    // Righe scritte per giorno sotto il limite Free (100.000).
    expect(Math.max(...perDay) * 2).toBeLessThan(100_000);
  });
});

describe('BudgetLedger — freschezza adattiva', () => {
  it('30 s in condizioni normali; 60 s oltre l’80%, 120 s oltre il 95% di una quota', () => {
    const limits = { perTenSeconds: 1e9, perMinute: 1e9, perDay: 100, perThirtyDays: 1e9 };
    const l = ledger(new MemoryLedgerStore(), limits);
    const ttls: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const d = l.acquire(T0 + i * 60_000);
      if (d.kind !== 'granted') throw new Error('atteso permesso');
      ttls.push(d.ttlS);
    }
    expect(ttls.slice(0, 79).every((t) => t === 30)).toBe(true);
    expect(ttls[79]).toBe(60); // 80/100
    expect(ttls[94]).toBe(120); // 95/100
  });

  it('uso tipico (pochi utenti) resta sempre a 30 s', () => {
    const l = ledger(new MemoryLedgerStore());
    for (let i = 0; i < 2 * 60 * 6; i += 1) {
      // 1 area osservata per 6 ore: 2 chiamate al minuto.
      const d = l.acquire(T0 + i * 30_000);
      expect(d).toMatchObject({ kind: 'granted', ttlS: 30 });
    }
  });
});

describe('BudgetLedger — pausa 429 e guasti di persistenza', () => {
  it('pausa globale con limiti min/max, mai accorciata', () => {
    const l = ledger(new MemoryLedgerStore());
    expect(l.pause(T0, 1)).toBe(T0 + 10_000);
    expect(l.acquire(T0 + 5_000)).toMatchObject({
      kind: 'denied',
      scope: 'paused',
      retryAfterMs: 5_000,
    });
    expect(l.pause(T0, 10 * 60_000)).toBe(T0 + 300_000);
    expect(l.pause(T0 + 1, 20_000)).toBe(T0 + 300_000);
    expect(l.acquire(T0 + 300_000).kind).toBe('granted');
  });

  it('scrittura fallita → eccezione, nessun permesso registrato', () => {
    const store = new MemoryLedgerStore();
    const l = ledger(store);
    store.failWrites = true;
    expect(() => l.acquire(T0)).toThrow();
    store.failWrites = false;
    expect(l.usage(T0).lastMinute).toBe(0);
    expect(l.acquire(T0)).toMatchObject({ kind: 'granted', usage: { lastMinute: 1 } });
  });

  it('riavvio dell’oggetto: lo stato riletto mantiene i limiti', () => {
    const store = new MemoryLedgerStore();
    const a = ledger(store);
    for (let i = 0; i < 4; i += 1) a.acquire(T0 + i);
    a.pause(T0, 30_000);
    const b = ledger(store);
    expect(b.acquire(T0 + 20_000)).toMatchObject({ kind: 'denied', scope: 'paused' });
    expect(b.usage(T0 + 5).lastTenSeconds).toBe(4);
    expect(b.usage(T0 + 5).lastDay).toBe(4);
  });
});

describe('SqlLedgerStore su SQLite reale (node:sqlite)', () => {
  it('schema, round trip, riavvio e pulizia oltre 30 giorni', async () => {
    const sql = await openNodeSql();
    try {
      const a = ledger(new SqlLedgerStore(sql));
      for (let i = 0; i < 3; i += 1) a.acquire(T0 + i * 3_000);
      a.pause(T0 + 10_000, 20_000);
      // Riavvio: nuova istanza sullo stesso database.
      const b = ledger(new SqlLedgerStore(sql));
      expect(b.usage(T0 + 9_000)).toMatchObject({ lastTenSeconds: 3, lastMinute: 3, lastDay: 3 });
      expect(b.acquire(T0 + 15_000)).toMatchObject({ kind: 'denied', scope: 'paused' });
      // 31 giorni dopo: le ore vecchie sono eliminate dal database.
      expect(b.acquire(T0 + 31 * DAY).kind).toBe('granted');
      const rows = sql.exec('SELECT hour, n FROM usage_hours').toArray();
      expect(rows).toHaveLength(1);
    } finally {
      sql.close();
    }
  });

  it('valori corrotti ignorati senza bloccare l’avvio', async () => {
    const sql = await openNodeSql();
    try {
      new SqlLedgerStore(sql);
      sql.exec("INSERT INTO meta (k, v) VALUES ('recent', 'non-json')");
      sql.exec("INSERT INTO meta (k, v) VALUES ('pauseUntil', 'x')");
      const l = ledger(new SqlLedgerStore(sql));
      expect(l.acquire(T0).kind).toBe('granted');
    } finally {
      sql.close();
    }
  });
});
