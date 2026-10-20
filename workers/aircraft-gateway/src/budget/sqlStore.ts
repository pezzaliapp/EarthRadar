import type { LedgerSnapshot, LedgerStore } from './ledger.ts';

/**
 * Persistenza del registro nel backend SQLite del Durable Object
 * (`ctx.storage.sql`, l'unico disponibile sul piano Workers Free).
 * L'API è sincrona: le scritture avvengono prima che il Durable Object
 * risponda, quindi un permesso concesso è già durevole.
 *
 * Costo per permesso: 2 righe scritte (ora + permessi recenti). Al tetto di
 * 9.500 permessi/giorno sono ~19.000 righe, sotto le 100.000/giorno del piano
 * Free. Le letture avvengono solo all'avvio dell'oggetto (≤ ~725 righe).
 */

/** Sottoinsieme di `SqlStorage` usato qui (iniettabile nei test). */
export interface SqlStorageLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS usage_hours (hour INTEGER PRIMARY KEY, n INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
];

const UPSERT_META =
  'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';

export class SqlLedgerStore implements LedgerStore {
  private readonly sql: SqlStorageLike;

  constructor(sql: SqlStorageLike) {
    this.sql = sql;
    for (const statement of SCHEMA) this.sql.exec(statement);
  }

  load(): LedgerSnapshot {
    const hours: Array<[number, number]> = [];
    for (const row of this.sql.exec('SELECT hour, n FROM usage_hours').toArray()) {
      const h = Number(row.hour);
      const n = Number(row.n);
      if (Number.isInteger(h) && Number.isFinite(n) && n > 0) hours.push([h, n]);
    }
    const meta = new Map<string, string>();
    for (const row of this.sql.exec('SELECT k, v FROM meta').toArray()) {
      meta.set(String(row.k), String(row.v));
    }
    let recent: number[] = [];
    try {
      const parsed: unknown = JSON.parse(meta.get('recent') ?? '[]');
      if (Array.isArray(parsed)) recent = parsed.filter((t): t is number => Number.isFinite(t));
    } catch {
      // Valore illeggibile: le ore restano, conteggio per minuto perso solo in questo caso.
    }
    const pauseUntil = Number(meta.get('pauseUntil') ?? 0);
    return { recent, hours, pauseUntil: Number.isFinite(pauseUntil) ? pauseUntil : 0 };
  }

  recordGrant(hour: number, countInHour: number, recent: readonly number[]): void {
    this.sql.exec(
      'INSERT INTO usage_hours (hour, n) VALUES (?, ?) ON CONFLICT(hour) DO UPDATE SET n = excluded.n',
      hour,
      countInHour,
    );
    this.sql.exec(UPSERT_META, 'recent', JSON.stringify(recent));
  }

  setPauseUntil(until: number): void {
    this.sql.exec(UPSERT_META, 'pauseUntil', String(until));
  }

  pruneHoursBefore(hour: number): void {
    this.sql.exec('DELETE FROM usage_hours WHERE hour < ?', hour);
  }
}
