import { ADAPTIVE_TTL_STEPS, BREAKER_MS, CACHE_FRESH_TTL_S, UPSTREAM_BUDGET } from '../config.ts';
import { BudgetLedger, type LedgerStore } from './ledger.ts';
import { SqlLedgerStore, type SqlStorageLike } from './sqlStore.ts';

/**
 * Durable Object `UpstreamBudget`: UNA sola istanza (idFromName) per la chiave
 * FlyItalyADSB, condivisa da tutti gli isolate e data center del gateway.
 *
 * Backend SQLite (migrazione `new_sqlite_classes`), disponibile sul piano
 * Workers Free: superate le quote gratuite le operazioni falliscono, non
 * vengono addebitate; il gateway tratta ogni errore come "nessuna chiamata
 * upstream".
 *
 * Protocollo interno (mai esposto su Internet: si raggiunge solo dal binding):
 *   POST /acquire      → 200 BudgetDecision (JSON)
 *   POST /rate-limited → 200 { pauseUntil }   body: { retryAfterMs }
 *
 * Nessun `await` fra lettura e scrittura dello stato: le richieste sono
 * elaborate una alla volta, quindi due permessi non si sovrappongono mai.
 */

/** Sottoinsieme di `DurableObjectState` usato qui. */
export interface BudgetObjectState {
  storage: { sql: SqlStorageLike };
}

export interface BudgetObjectDeps {
  now?: () => number;
  store?: LedgerStore;
}

export class UpstreamBudgetObject {
  private readonly ledger: BudgetLedger;
  private readonly now: () => number;

  constructor(state: BudgetObjectState, _env?: unknown, deps: BudgetObjectDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.ledger = new BudgetLedger({
      limits: UPSTREAM_BUDGET,
      baseTtlS: CACHE_FRESH_TTL_S,
      adaptive: ADAPTIVE_TTL_STEPS,
      pauseMinMs: BREAKER_MS.rateLimitedMin,
      pauseMaxMs: BREAKER_MS.rateLimitedMax,
      store: deps.store ?? new SqlLedgerStore(state.storage.sql),
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    const { pathname } = new URL(request.url);
    try {
      switch (pathname) {
        case '/acquire':
          return reply(this.ledger.acquire(this.now()), 200);
        case '/rate-limited': {
          const requested = await readRetryAfter(request);
          return reply({ pauseUntil: this.ledger.pause(this.now(), requested) }, 200);
        }
        default:
          return reply({ error: 'not_found' }, 404);
      }
    } catch {
      // Es. quota di scrittura SQLite esaurita: il gateway non chiamerà il provider.
      return reply({ error: 'budget_error' }, 500);
    }
  }
}

async function readRetryAfter(request: Request): Promise<number> {
  try {
    const body = (await request.json()) as { retryAfterMs?: unknown };
    const v = Number(body.retryAfterMs);
    return Number.isFinite(v) && v > 0 ? v : BREAKER_MS.rateLimitedDefault;
  } catch {
    return BREAKER_MS.rateLimitedDefault;
  }
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
