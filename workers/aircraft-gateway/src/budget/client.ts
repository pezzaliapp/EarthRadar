import { UPSTREAM_BUDGET_OBJECT_NAME, UPSTREAM_BUDGET_TIMEOUT_MS } from '../config.ts';
import type { BudgetUsage, DenyScope } from './ledger.ts';

/**
 * Lato Worker del budget globale. Regola: SENZA permesso non si chiama mai
 * FlyItalyADSB. Binding assente, Durable Object irraggiungibile, lento,
 * in errore o con risposta illeggibile → BudgetUnavailableError (fail closed).
 */

export interface BudgetGrant {
  ttlS: number;
  usage: BudgetUsage;
}

export interface UpstreamBudget {
  /** Risolve con il permesso; lancia BudgetDeniedError o BudgetUnavailableError. */
  acquire(): Promise<BudgetGrant>;
  /** Segnala un 429 del provider: pausa globale. Best-effort. */
  reportRateLimited(retryAfterMs: number): Promise<void>;
}

export class BudgetDeniedError extends Error {
  readonly scope: DenyScope;
  readonly retryAfterMs: number;
  readonly usage: BudgetUsage | null;

  constructor(scope: DenyScope, retryAfterMs: number, usage: BudgetUsage | null = null) {
    super(`upstream budget denied (${scope})`);
    this.name = 'BudgetDeniedError';
    this.scope = scope;
    this.retryAfterMs = retryAfterMs;
    this.usage = usage;
  }
}

export class BudgetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetUnavailableError';
  }
}

/** Sottoinsiemi di `DurableObjectNamespace` / stub usati qui (iniettabili nei test). */
export interface BudgetStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}
export interface BudgetNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown, options?: { locationHint?: string }): BudgetStubLike;
}

export interface DurableBudgetOptions {
  timeoutMs?: number;
}

const SCOPES: ReadonlySet<string> = new Set([
  'paused',
  'ten_seconds',
  'minute',
  'day',
  'thirty_days',
]);

function parseUsage(v: unknown): BudgetUsage | null {
  if (!v || typeof v !== 'object') return null;
  const u = v as Record<string, unknown>;
  const keys = ['lastTenSeconds', 'lastMinute', 'lastDay', 'lastThirtyDays'] as const;
  for (const k of keys) if (typeof u[k] !== 'number' || !Number.isFinite(u[k])) return null;
  return {
    lastTenSeconds: u.lastTenSeconds as number,
    lastMinute: u.lastMinute as number,
    lastDay: u.lastDay as number,
    lastThirtyDays: u.lastThirtyDays as number,
  };
}

export function createDurableBudget(
  namespace: BudgetNamespaceLike | undefined,
  opts: DurableBudgetOptions = {},
): UpstreamBudget {
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_BUDGET_TIMEOUT_MS;

  /**
   * Uno stub nuovo per ogni chiamata: lo stub è legato alla richiesta che lo
   * ha creato e il runtime ne rifiuta l'uso da un'altra richiesta. Crearlo
   * non comporta traffico né costi.
   */
  function getStub(): BudgetStubLike {
    if (!namespace) throw new BudgetUnavailableError('budget binding not configured');
    // Europa occidentale: vicino agli utenti e al provider (solo un suggerimento).
    return namespace.get(namespace.idFromName(UPSTREAM_BUDGET_OBJECT_NAME), {
      locationHint: 'weur',
    });
  }

  async function call(path: string, body?: unknown): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BudgetUnavailableError('budget timeout')), timeoutMs);
    });
    try {
      const res = await Promise.race([
        getStub().fetch(`https://budget.internal${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body === undefined ? '{}' : JSON.stringify(body),
        }),
        timeout,
      ]);
      if (res.status !== 200) {
        await res.body?.cancel();
        throw new BudgetUnavailableError(`budget HTTP ${res.status}`);
      }
      return await Promise.race([res.json() as Promise<unknown>, timeout]);
    } catch (err) {
      if (err instanceof BudgetUnavailableError) throw err;
      // Nessun dettaglio: l'errore del runtime non deve finire nelle risposte.
      throw new BudgetUnavailableError('budget unreachable');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async acquire() {
      const data = await call('/acquire');
      const d = (data ?? {}) as Record<string, unknown>;
      const usage = parseUsage(d.usage);
      if (d.kind === 'granted' && typeof d.ttlS === 'number' && d.ttlS > 0 && usage) {
        return { ttlS: d.ttlS, usage };
      }
      if (
        d.kind === 'denied' &&
        typeof d.scope === 'string' &&
        SCOPES.has(d.scope) &&
        typeof d.retryAfterMs === 'number' &&
        Number.isFinite(d.retryAfterMs)
      ) {
        throw new BudgetDeniedError(d.scope as DenyScope, Math.max(1, d.retryAfterMs), usage);
      }
      throw new BudgetUnavailableError('budget invalid response');
    },
    async reportRateLimited(retryAfterMs) {
      await call('/rate-limited', { retryAfterMs });
    },
  };
}
