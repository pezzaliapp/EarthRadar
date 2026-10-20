import type { BudgetNamespaceLike, UpstreamBudget } from '../src/budget/client.ts';
import type { LedgerSnapshot, LedgerStore } from '../src/budget/ledger.ts';
import type { SqlStorageLike } from '../src/budget/sqlStore.ts';

/** Store in memoria con guasti iniettabili (es. quota di scrittura SQLite esaurita). */
export class MemoryLedgerStore implements LedgerStore {
  recent: number[] = [];
  hours = new Map<number, number>();
  pauseUntil = 0;
  writes = 0;
  failWrites = false;

  load(): LedgerSnapshot {
    return { recent: [...this.recent], hours: [...this.hours], pauseUntil: this.pauseUntil };
  }

  recordGrant(hour: number, countInHour: number, recent: readonly number[]): void {
    if (this.failWrites) throw new Error('SQLITE_FULL (simulato)');
    this.writes += 2;
    this.hours.set(hour, countInHour);
    this.recent = [...recent];
  }

  setPauseUntil(until: number): void {
    if (this.failWrites) throw new Error('SQLITE_FULL (simulato)');
    this.writes += 1;
    this.pauseUntil = until;
  }

  pruneHoursBefore(hour: number): void {
    for (const h of this.hours.keys()) if (h < hour) this.hours.delete(h);
  }
}

interface NodeStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): unknown;
}
interface NodeDatabase {
  prepare(sql: string): NodeStatement;
  close(): void;
}

/** SQLite vero (node:sqlite) con la stessa forma di `ctx.storage.sql.exec`. */
export async function openNodeSql(path = ':memory:'): Promise<SqlStorageLike & { close(): void }> {
  // Modulo nativo di Node (≥ 22.5), caricato senza passare dal bundler di Vite.
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.('node:sqlite') as
    | { DatabaseSync: new (p: string) => NodeDatabase }
    | undefined;
  if (!mod) throw new Error('node:sqlite non disponibile (serve Node ≥ 22.5)');
  const db = new mod.DatabaseSync(path);
  return {
    exec(query, ...bindings) {
      const stmt = db.prepare(query);
      if (/^\s*select/i.test(query)) {
        const rows = stmt.all(...bindings);
        return { toArray: () => rows };
      }
      stmt.run(...bindings);
      return { toArray: () => [] };
    },
    close: () => db.close(),
  };
}

/** Oggetto con `fetch` (il Durable Object) dietro un finto namespace. */
export interface FetchTarget {
  fetch(request: Request): Promise<Response>;
}

export interface FakeNamespaceOptions {
  /** Ritardo di rete simulato verso il Durable Object. */
  delay?: () => Promise<void>;
  /** Guasto simulato: l'invocazione rifiuta come un errore del runtime. */
  fail?: () => boolean;
}

/**
 * Come il runtime Workers: uno stub vale per una sola richiesta (riusarlo da
 * un'altra richiesta lancia "Cannot perform I/O on behalf of a different request").
 * Qui: un uso per stub.
 */

export function fakeNamespace(target: FetchTarget, opts: FakeNamespaceOptions = {}) {
  const calls: string[] = [];
  const ids: unknown[] = [];
  const ns: BudgetNamespaceLike = {
    idFromName: (name) => {
      ids.push(name);
      return { name };
    },
    get: () => {
      let used = false;
      return {
        async fetch(input, init) {
          if (used) throw new Error('Cannot perform I/O on behalf of a different request');
          used = true;
          calls.push(new URL(input).pathname);
          await opts.delay?.();
          if (opts.fail?.()) throw new Error('Durable Object reset (simulato) — dettaglio interno');
          return target.fetch(new Request(input, init));
        },
      };
    },
  };
  return { ns, calls, ids };
}

/** Budget senza limiti per i test che non riguardano il budget. */
export function unlimitedBudget(): UpstreamBudget & { acquired: number; reports: number[] } {
  const b = {
    acquired: 0,
    reports: [] as number[],
    async acquire() {
      b.acquired += 1;
      return {
        ttlS: 30,
        usage: { lastTenSeconds: 0, lastMinute: 0, lastDay: 0, lastThirtyDays: 0 },
      };
    },
    async reportRateLimited(ms: number) {
      b.reports.push(ms);
    },
  };
  return b;
}
