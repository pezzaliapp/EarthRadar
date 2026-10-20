/**
 * Registro GLOBALE delle chiamate a FlyItalyADSB (logica pura, senza runtime).
 *
 * Vive dentro un unico Durable Object (vedi durableObject.ts): ogni chiamata
 * upstream di qualunque isolate e data center deve prima ottenere un permesso
 * da qui. Le decisioni sono sincrone (nessun `await` fra lettura e scrittura
 * dello stato): il Durable Object elabora un evento alla volta, quindi due
 * richieste concorrenti non possono mai ottenere lo stesso posto.
 *
 * Finestre, tutte MOBILI (mai allineate a minuti, giorni o mesi di calendario):
 *  - 10 s e 60 s: timestamp esatti dei permessi concessi;
 *  - 24 h e 30 giorni: contatori orari. Si sommano anche le ore solo in parte
 *    dentro la finestra, quindi il conteggio è sempre per eccesso.
 *
 * Con i limiti di config.ts: qualunque finestra di 60 s ≤ 24 chiamate,
 * qualunque 24 h ≤ 9.500, qualunque 30 giorni ≤ 285.000, e qualunque periodo
 * di 31 giorni (mese di calendario compreso) ≤ 294.500 < 300.000.
 *
 * Ogni permesso concesso conta come chiamata, anche se poi fallisce: il
 * provider potrebbe contarla comunque.
 */

export interface BudgetLimits {
  perTenSeconds: number;
  perMinute: number;
  perDay: number;
  perThirtyDays: number;
}

/** Freschezza adattiva: oltre `atRatio` di una qualunque quota, fotografie più durature. */
export interface AdaptiveTtlStep {
  atRatio: number;
  ttlS: number;
}

export interface BudgetUsage {
  lastTenSeconds: number;
  lastMinute: number;
  lastDay: number;
  lastThirtyDays: number;
}

export type DenyScope = 'paused' | 'ten_seconds' | 'minute' | 'day' | 'thirty_days';

export type BudgetDecision =
  | { kind: 'granted'; ttlS: number; usage: BudgetUsage }
  | { kind: 'denied'; scope: DenyScope; retryAfterMs: number; usage: BudgetUsage };

export interface LedgerSnapshot {
  /** Permessi degli ultimi 60 s (ms epoch, crescenti). */
  recent: number[];
  /** [indice ora UTC (ms / 3.600.000), permessi in quell'ora]. */
  hours: Array<[number, number]>;
  /** Pausa globale (dopo un 429 del provider), ms epoch; 0 = nessuna. */
  pauseUntil: number;
}

/** Persistenza sincrona: se lancia, il permesso NON è concesso. */
export interface LedgerStore {
  load(): LedgerSnapshot;
  recordGrant(hour: number, countInHour: number, recent: readonly number[]): void;
  setPauseUntil(until: number): void;
  pruneHoursBefore(hour: number): void;
}

export interface LedgerOptions {
  limits: BudgetLimits;
  baseTtlS: number;
  adaptive: readonly AdaptiveTtlStep[];
  pauseMinMs: number;
  pauseMaxMs: number;
  store: LedgerStore;
}

const HOUR_MS = 3_600_000;
const TEN_S_MS = 10_000;
const MINUTE_MS = 60_000;
/** 24 h esatte toccano fino a 25 ore orarie, 30 giorni fino a 721. */
const DAY_HOURS = 25;
const THIRTY_DAYS_HOURS = 30 * 24 + 1;

const hourOf = (ms: number) => Math.floor(ms / HOUR_MS);

export class BudgetLedger {
  private recent: number[];
  private readonly hours: Map<number, number>;
  private pauseUntil: number;
  private lastPrunedHour = -1;
  private readonly opts: LedgerOptions;

  constructor(opts: LedgerOptions) {
    this.opts = opts;
    const loaded = opts.store.load();
    this.recent = loaded.recent.filter(Number.isFinite).sort((a, b) => a - b);
    this.hours = new Map(loaded.hours.filter(([h, n]) => Number.isInteger(h) && n > 0));
    this.pauseUntil = Number.isFinite(loaded.pauseUntil) ? loaded.pauseUntil : 0;
  }

  acquire(now: number): BudgetDecision {
    const { limits } = this.opts;
    this.recent = this.recent.filter((t) => t > now - MINUTE_MS);
    const usage = this.usage(now);
    const deny = (scope: DenyScope, retryAfterMs: number): BudgetDecision => ({
      kind: 'denied',
      scope,
      retryAfterMs: Math.max(1, Math.ceil(retryAfterMs)),
      usage,
    });

    if (this.pauseUntil > now) return deny('paused', this.pauseUntil - now);

    const inTen = this.recent.filter((t) => t > now - TEN_S_MS);
    if (inTen.length >= limits.perTenSeconds) {
      return deny('ten_seconds', inTen[inTen.length - limits.perTenSeconds]! + TEN_S_MS - now);
    }
    if (this.recent.length >= limits.perMinute) {
      return deny('minute', this.recent[this.recent.length - limits.perMinute]! + MINUTE_MS - now);
    }
    if (usage.lastDay >= limits.perDay) return deny('day', this.releaseMs(now, DAY_HOURS));
    if (usage.lastThirtyDays >= limits.perThirtyDays) {
      return deny('thirty_days', this.releaseMs(now, THIRTY_DAYS_HOURS));
    }

    const hour = hourOf(now);
    const nextRecent = [...this.recent, now];
    const countInHour = (this.hours.get(hour) ?? 0) + 1;
    // Prima la scrittura durevole: se fallisce, nessun permesso e stato invariato.
    this.opts.store.recordGrant(hour, countInHour, nextRecent);
    this.recent = nextRecent;
    this.hours.set(hour, countInHour);
    this.prune(hour);

    const after: BudgetUsage = {
      lastTenSeconds: inTen.length + 1,
      lastMinute: nextRecent.length,
      lastDay: usage.lastDay + 1,
      lastThirtyDays: usage.lastThirtyDays + 1,
    };
    return { kind: 'granted', ttlS: this.ttlFor(after), usage: after };
  }

  /** Il provider ha risposto 429: pausa per TUTTI gli isolate e data center. */
  pause(now: number, requestedMs: number): number {
    const { pauseMinMs, pauseMaxMs } = this.opts;
    const ms = Math.min(pauseMaxMs, Math.max(pauseMinMs, requestedMs));
    const until = Math.max(this.pauseUntil, now + ms);
    if (until !== this.pauseUntil) {
      this.opts.store.setPauseUntil(until);
      this.pauseUntil = until;
    }
    return until;
  }

  usage(now: number): BudgetUsage {
    const hour = hourOf(now);
    return {
      lastTenSeconds: this.recent.filter((t) => t > now - TEN_S_MS && t <= now).length,
      lastMinute: this.recent.filter((t) => t > now - MINUTE_MS && t <= now).length,
      lastDay: this.sumHours(hour, DAY_HOURS),
      lastThirtyDays: this.sumHours(hour, THIRTY_DAYS_HOURS),
    };
  }

  private ttlFor(u: BudgetUsage): number {
    const { limits, adaptive, baseTtlS } = this.opts;
    const ratio = Math.max(
      u.lastMinute / limits.perMinute,
      u.lastDay / limits.perDay,
      u.lastThirtyDays / limits.perThirtyDays,
    );
    let ttlS = baseTtlS;
    for (const step of adaptive) if (ratio >= step.atRatio) ttlS = Math.max(ttlS, step.ttlS);
    return ttlS;
  }

  private sumHours(hour: number, span: number): number {
    let sum = 0;
    for (const [h, n] of this.hours) if (h > hour - span && h <= hour) sum += n;
    return sum;
  }

  /** Quando la più vecchia ora con permessi esce dalla finestra di `span` ore. */
  private releaseMs(now: number, span: number): number {
    const hour = hourOf(now);
    let oldest = hour;
    for (const [h, n] of this.hours) if (n > 0 && h > hour - span && h < oldest) oldest = h;
    return (oldest + span) * HOUR_MS - now;
  }

  private prune(hour: number): void {
    if (hour === this.lastPrunedHour) return;
    const keepFrom = hour - THIRTY_DAYS_HOURS;
    for (const h of this.hours.keys()) if (h <= keepFrom) this.hours.delete(h);
    try {
      this.opts.store.pruneHoursBefore(keepFrom + 1);
      this.lastPrunedHour = hour;
    } catch {
      // Pulizia rimandata: le ore vecchie restano fuori da ogni finestra.
    }
  }
}
