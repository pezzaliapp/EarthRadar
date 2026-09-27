/**
 * Livello 1 della cache: memoria dell'isolate + coalescing.
 *
 * Una `Snapshot` è la risposta JSON di un'area già serializzata: tutti i
 * client della stessa cella ricevono gli stessi byte, senza riserializzare
 * (conta sul limite CPU del piano Free). La freschezza è decisa da
 * `fetchedAt`, non dal momento dell'inserimento: una fotografia arrivata
 * dalla Cache API non "ringiovanisce" copiandola in memoria.
 */

export interface Snapshot {
  /** Corpo JSON completo (AircraftResponse con status "ok"). */
  body: string;
  /** Quando il gateway ha ottenuto i dati dal provider (ms epoch). */
  fetchedAt: number;
  count: number;
}

export interface MemoryCacheOptions {
  /** Oltre `fetchedAt + retainMs` la voce è eliminata (freschezza + finestra stale). */
  retainMs: number;
  maxEntries: number;
  now?: () => number;
}

export class SnapshotMemoryCache {
  private readonly entries = new Map<string, Snapshot>();
  private readonly retainMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: MemoryCacheOptions) {
    this.retainMs = opts.retainMs;
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.now = opts.now ?? (() => Date.now());
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): Snapshot | null {
    const s = this.entries.get(key);
    if (!s) return null;
    if (this.now() - s.fetchedAt > this.retainMs) {
      this.entries.delete(key);
      return null;
    }
    return s;
  }

  /** Conserva sempre la fotografia più recente. */
  set(key: string, snapshot: Snapshot): void {
    const existing = this.entries.get(key);
    if (existing && existing.fetchedAt >= snapshot.fetchedAt) return;
    const now = this.now();
    this.entries.delete(key);
    this.entries.set(key, snapshot);
    // Map conserva l'ordine d'inserimento: le prime voci sono le più vecchie.
    for (const [k, s] of this.entries) {
      if (this.entries.size <= this.maxEntries && now - s.fetchedAt <= this.retainMs) break;
      this.entries.delete(k);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Coalescing: richieste concorrenti con la stessa chiave condividono un solo
 * caricamento. `onStart` riceve la promise del caricamento (solo per il
 * leader): l'handler la passa a `ctx.waitUntil`, così il fetch non viene
 * cancellato se il client che l'ha avviato si disconnette.
 */
export class Coalescer<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  get inflightCount(): number {
    return this.inflight.size;
  }

  async run(
    key: string,
    load: () => Promise<T>,
    onStart?: (p: Promise<T>) => void,
  ): Promise<{ value: T; leader: boolean }> {
    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, leader: false };
    const promise = (async () => {
      try {
        return await load();
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    onStart?.(promise);
    return { value: await promise, leader: true };
  }
}
