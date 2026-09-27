import { parseAllowedOrigins } from './cors.ts';
import type { EdgeCacheStore } from './edgeCache.ts';
import { createGateway, type Gateway, type WaitUntilContext } from './handler.ts';
import { createFlyItalyAdsbProvider } from './providers/flyItalyAdsb.ts';

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
 */

export interface Env {
  ALLOWED_ORIGINS?: string;
  UPSTREAM_BASE_URL?: string;
  /** Secret Cloudflare. Usato solo come header upstream, mai loggato né restituito. */
  FLYITALYADSB_API_KEY?: string;
}

/** `caches.default` del runtime Workers; assente in Node/test. */
function defaultEdgeStore(): EdgeCacheStore | null {
  const storage = (globalThis as { caches?: { default?: EdgeCacheStore } }).caches;
  return storage?.default ?? null;
}

let instance: { key: string; gateway: Gateway } | null = null;

function getGateway(env: Env): Gateway {
  // Solo la presenza della chiave entra nella chiave di istanza, mai il valore.
  const key = `${env.ALLOWED_ORIGINS ?? ''}|${env.UPSTREAM_BASE_URL ?? ''}|${env.FLYITALYADSB_API_KEY ? 1 : 0}`;
  if (!instance || instance.key !== key) {
    instance = {
      key,
      gateway: createGateway({
        provider: createFlyItalyAdsbProvider({
          apiKey: env.FLYITALYADSB_API_KEY,
          baseUrl: env.UPSTREAM_BASE_URL,
        }),
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
