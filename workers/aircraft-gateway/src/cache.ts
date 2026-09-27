/**
 * Cache in memoria per isolate con TTL + coalescing delle richieste identiche.
 *
 * Best-effort e compatibile con *.workers.dev (dove la Cache API non è
 * disponibile): ogni isolate ha la propria copia, nessun costo, nessun
 * binding. Solo i risultati riusciti vengono memorizzati.
 */

export type CacheOutcomeKind = 'hit' | 'miss' | 'coalesced';

export interface TtlCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: TtlCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.now = opts.now ?? (() => Date.now());
  }

  get size(): number {
    return this.entries.size;
  }

  get inflightCount(): number {
    return this.inflight.size;
  }

  /**
   * `onLoad` riceve la promise del loader appena creata (solo su miss):
   * l'handler la passa a `ctx.waitUntil`, così il fetch non viene cancellato
   * se il client che l'ha avviato si disconnette mentre altri la attendono.
   */
  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    onLoad?: (p: Promise<T>) => void,
  ): Promise<{ value: T; cache: CacheOutcomeKind }> {
    const entry = this.entries.get(key);
    if (entry) {
      if (entry.expiresAt > this.now()) return { value: entry.value, cache: 'hit' };
      this.entries.delete(key);
    }

    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, cache: 'coalesced' };

    const promise = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    onLoad?.(promise);
    return { value: await promise, cache: 'miss' };
  }

  clear(): void {
    this.entries.clear();
    this.inflight.clear();
  }

  private set(key: string, value: T): void {
    const now = this.now();
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    for (const [k, e] of this.entries) {
      if (this.entries.size <= this.maxEntries && e.expiresAt > now) break;
      this.entries.delete(k);
    }
  }
}
