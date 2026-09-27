import type { OpenCircuit } from './breaker.ts';
import type { Snapshot } from './cache.ts';
import type { GatewayReason, GatewayStatus } from './types.ts';

/**
 * Livello 2 della cache: Cloudflare Cache API (`caches.default`).
 *
 * - Funziona solo con il Worker su Custom Domain (aircraft.alessandropezzali.it).
 *   Su *.workers.dev le operazioni non hanno effetto: il gateway resta
 *   corretto (cache in memoria) ma perde la condivisione fra isolate.
 * - È locale al data center: non replica fra data center e `cache.put` non
 *   usa la Tiered Cache. Utenti serviti dallo stesso data center condividono
 *   la stessa fotografia di un'area; data center diversi no.
 * - Le chiavi sono URL sintetici sotto `/__cache/…`, costruiti SOLO dall'area
 *   quantizzata: nessun parametro del client, nessun `Origin`, nessun `Vary`.
 *   Gli header CORS si aggiungono dopo, per richiesta.
 * - Ogni errore della Cache API è ignorato: la cache è un'ottimizzazione,
 *   mai un punto di rottura.
 *
 * Oltre alle fotografie, qui vivono due marcatori condivisi fra isolate:
 * - breaker: dopo un errore upstream nessun isolate del data center
 *   richiama il provider fino alla scadenza;
 * - lock di aggiornamento per area: un solo isolate alla volta rinfresca
 *   un'area, gli altri servono la fotografia precedente.
 */

/** Sottoinsieme di `Cache` usato dal gateway (iniettabile nei test). */
export interface EdgeCacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface EdgeCacheOptions {
  store: EdgeCacheStore | null;
  keyOrigin: string;
  keyPrefix: string;
  providerId: string;
  /** Vita della fotografia nella Cache API (freschezza + finestra stale). */
  retainS: number;
  now?: () => number;
  onError?: (op: string, err: unknown) => void;
}

const FETCHED_AT_HEADER = 'X-EarthRadar-Fetched-At';
const COUNT_HEADER = 'X-EarthRadar-Count';

const STATUSES: ReadonlySet<string> = new Set(['unavailable', 'rate_limited']);
const REASONS: ReadonlySet<string> = new Set([
  'upstream_timeout',
  'upstream_network',
  'upstream_http_4xx',
  'upstream_http_5xx',
  'upstream_429',
  'upstream_invalid',
  'provider_not_configured',
  'gateway_busy',
]);

export class EdgeCache {
  private readonly store: EdgeCacheStore | null;
  private readonly base: string;
  private readonly retainS: number;
  private readonly now: () => number;
  private readonly onError: (op: string, err: unknown) => void;

  constructor(opts: EdgeCacheOptions) {
    this.store = opts.store;
    const prefix = opts.keyPrefix.replace(/\/+$/, '');
    this.base = `${opts.keyOrigin.replace(/\/+$/, '')}${prefix}/${encodeURIComponent(opts.providerId)}`;
    this.retainS = opts.retainS;
    this.now = opts.now ?? (() => Date.now());
    this.onError = opts.onError ?? ((op, err) => console.warn(`edge cache ${op} failed`, err));
  }

  get enabled(): boolean {
    return this.store !== null;
  }

  /** URL sintetico della fotografia di un'area (chiave già quantizzata, es. "45,9.5,150"). */
  snapshotKey(areaKey: string): string {
    return `${this.base}/aircraft/${areaKey.split(',').map(encodeURIComponent).join('/')}`;
  }

  lockKey(areaKey: string): string {
    return `${this.snapshotKey(areaKey)}/lock`;
  }

  breakerKey(): string {
    return `${this.base}/breaker`;
  }

  async getSnapshot(areaKey: string): Promise<Snapshot | null> {
    const res = await this.match('match snapshot', this.snapshotKey(areaKey));
    if (!res) return null;
    const fetchedAt = Number(res.headers.get(FETCHED_AT_HEADER));
    const count = Number(res.headers.get(COUNT_HEADER));
    if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || !Number.isFinite(count)) {
      await res.body?.cancel();
      return null;
    }
    // Scaduta per il nostro orologio (la Cache API può restituirla per qualche istante in più).
    if (this.now() - fetchedAt > this.retainS * 1000) {
      await res.body?.cancel();
      return null;
    }
    try {
      return { body: await res.text(), fetchedAt, count };
    } catch (err) {
      this.onError('read snapshot', err);
      return null;
    }
  }

  async putSnapshot(areaKey: string, snapshot: Snapshot): Promise<void> {
    await this.put(
      'put snapshot',
      this.snapshotKey(areaKey),
      new Response(snapshot.body, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${this.retainS}`,
          [FETCHED_AT_HEADER]: String(snapshot.fetchedAt),
          [COUNT_HEADER]: String(snapshot.count),
        },
      }),
    );
  }

  async getBreaker(): Promise<OpenCircuit | null> {
    const res = await this.match('match breaker', this.breakerKey());
    if (!res) return null;
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return null;
    }
    if (!data || typeof data !== 'object') return null;
    const { status, reason, openUntil } = data as Record<string, unknown>;
    if (
      typeof status !== 'string' ||
      !STATUSES.has(status) ||
      typeof reason !== 'string' ||
      !REASONS.has(reason) ||
      typeof openUntil !== 'number' ||
      !Number.isFinite(openUntil) ||
      openUntil <= this.now()
    ) {
      return null;
    }
    return {
      status: status as Exclude<GatewayStatus, 'ok'>,
      reason: reason as GatewayReason,
      openUntil,
    };
  }

  async putBreaker(open: OpenCircuit): Promise<void> {
    const ttlS = Math.ceil((open.openUntil - this.now()) / 1000);
    if (ttlS <= 0) return;
    await this.put(
      'put breaker',
      this.breakerKey(),
      new Response(JSON.stringify(open), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttlS}` },
      }),
    );
  }

  /**
   * Prova a prendere il lock di aggiornamento di un'area. Best-effort: fra
   * `match` e `put` resta una finestra di pochi ms, molto più stretta della
   * latenza upstream che altrimenti separerebbe due isolate.
   * Senza Cache API restituisce sempre true (nulla da coordinare).
   */
  async tryAcquireRefreshLock(areaKey: string, ttlS: number): Promise<boolean> {
    if (!this.store) return true;
    const key = this.lockKey(areaKey);
    const existing = await this.match('match lock', key);
    if (existing) {
      await existing.body?.cancel();
      return false;
    }
    await this.put(
      'put lock',
      key,
      new Response('1', { headers: { 'Cache-Control': `public, max-age=${ttlS}` } }),
    );
    return true;
  }

  private async match(op: string, url: string): Promise<Response | undefined> {
    if (!this.store) return undefined;
    try {
      return await this.store.match(new Request(url));
    } catch (err) {
      this.onError(op, err);
      return undefined;
    }
  }

  private async put(op: string, url: string, response: Response): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.put(new Request(url), response);
    } catch (err) {
      this.onError(op, err);
    }
  }
}
