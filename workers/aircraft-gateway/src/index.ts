import { createDurableBudget, type BudgetNamespaceLike } from './budget/client.ts';
import { parseAllowedOrigins } from './cors.ts';
import type { EdgeCacheStore } from './edgeCache.ts';
import { createGateway, type Gateway, type WaitUntilContext } from './handler.ts';
import { createFlyItalyAdsbProvider } from './providers/flyItalyAdsb.ts';

/** Classe del Durable Object, esportata dal modulo principale come richiede il runtime. */
export { UpstreamBudgetObject } from './budget/durableObject.ts';

/**
 * EarthRadar aircraft gateway — entry point Cloudflare Workers.
 *
 *   GET /v1/health
 *   GET /v1/aircraft?lat=<deg>&lon=<deg>&r=<NM intero 1..150>
 *
 * Provider: FlyItalyADSB, chiave nel secret `FLYITALYADSB_API_KEY`
 * (`wrangler secret put`), mai nel codice né in wrangler.toml. Cache a due livelli:
 * memoria dell'isolate + Cache API del data center (attiva solo sul Custom
 * Domain aircraft.alessandropezzali.it).
 *
 * Ogni chiamata a FlyItalyADSB richiede un permesso del Durable Object
 * `UPSTREAM_BUDGET` (unico, globale): 24/min, 9.500 per 24 h, 285.000 per
 * 30 giorni. Binding assente o non raggiungibile → nessuna chiamata upstream.
 */

export interface Env {
  ALLOWED_ORIGINS?: string;
  UPSTREAM_BASE_URL?: string;
  /** Secret Cloudflare. Usato solo come header upstream, mai loggato né restituito. */
  FLYITALYADSB_API_KEY?: string;
  /** Binding del Durable Object SQLite `UpstreamBudgetObject` (wrangler.toml). */
  UPSTREAM_BUDGET?: BudgetNamespaceLike;
}

/** `caches.default` del runtime Workers; assente in Node/test. */
function defaultEdgeStore(): EdgeCacheStore | null {
  const storage = (globalThis as { caches?: { default?: EdgeCacheStore } }).caches;
  return storage?.default ?? null;
}

let instance: { key: string; budget: unknown; gateway: Gateway } | null = null;

function getGateway(env: Env): Gateway {
  // Solo la presenza della chiave entra nella chiave di istanza, mai il valore.
  const key = `${env.ALLOWED_ORIGINS ?? ''}|${env.UPSTREAM_BASE_URL ?? ''}|${env.FLYITALYADSB_API_KEY ? 1 : 0}`;
  if (!instance || instance.key !== key || instance.budget !== env.UPSTREAM_BUDGET) {
    instance = {
      key,
      budget: env.UPSTREAM_BUDGET,
      gateway: createGateway({
        provider: createFlyItalyAdsbProvider({
          apiKey: env.FLYITALYADSB_API_KEY,
          baseUrl: env.UPSTREAM_BASE_URL,
        }),
        budget: createDurableBudget(env.UPSTREAM_BUDGET),
        allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
        edgeStore: defaultEdgeStore(),
      }),
    };
  }
  return instance.gateway;
}

export default {
  fetch(request: Request, env: Env, ctx: WaitUntilContext): Promise<Response> {
    return getGateway(env).handle(request, ctx);
  },
};
