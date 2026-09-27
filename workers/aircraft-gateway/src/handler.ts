import { areaCacheKey, parseAreaParams } from './area.ts';
import { classifyUpstreamError, CircuitBreaker } from './breaker.ts';
import { TtlCache } from './cache.ts';
import {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  SERVICE_NAME,
  SERVICE_VERSION,
  SUCCESS_BROWSER_MAX_AGE_S,
  UPSTREAM_MAX_QUEUE,
  UPSTREAM_MIN_INTERVAL_MS,
} from './config.ts';
import { corsHeaders, decideCors, preflightHeaders, type CorsDecision } from './cors.ts';
import {
  UpstreamError,
  type AircraftProvider,
  type ProviderFetchResult,
} from './providers/types.ts';
import { ThrottleBusyError, UpstreamThrottle } from './throttle.ts';
import type { AircraftResponse, Area, GatewayReason } from './types.ts';

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface GatewayDeps {
  provider: AircraftProvider;
  allowedOrigins: ReadonlySet<string>;
  now?: () => number;
  cacheTtlMs?: number;
  throttle?: UpstreamThrottle;
}

interface LastUpstream {
  ok: boolean;
  at: number;
  reason: GatewayReason | null;
  httpStatus: number | null;
  upstreamMs: number | null;
  upstreamBytes: number | null;
  count: number | null;
}

export interface Gateway {
  handle(request: Request, ctx?: WaitUntilContext): Promise<Response>;
  /** Solo per test. */
  readonly cache: TtlCache<ProviderFetchResult>;
  readonly breaker: CircuitBreaker;
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export function createGateway(deps: GatewayDeps): Gateway {
  const now = deps.now ?? (() => Date.now());
  const cache = new TtlCache<ProviderFetchResult>({
    ttlMs: deps.cacheTtlMs ?? CACHE_TTL_MS,
    maxEntries: CACHE_MAX_ENTRIES,
    now,
  });
  const breaker = new CircuitBreaker(now);
  const throttle =
    deps.throttle ??
    new UpstreamThrottle({
      minIntervalMs: UPSTREAM_MIN_INTERVAL_MS,
      maxQueue: UPSTREAM_MAX_QUEUE,
      now,
    });
  let lastUpstream: LastUpstream | null = null;
  const info = deps.provider.info;

  function json(
    body: unknown,
    status: number,
    cors: CorsDecision,
    extra: Record<string, string> = {},
  ): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...BASE_HEADERS, ...corsHeaders(cors), 'Cache-Control': 'no-store', ...extra },
    });
  }

  function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
    return { v: 1, error, message, ...extra };
  }

  function failureResponse(
    cors: CorsDecision,
    httpStatus: number,
    status: 'unavailable' | 'rate_limited',
    reason: GatewayReason,
    retryAfterS: number,
    requested: Area,
    area: Area,
  ): Response {
    const body: AircraftResponse = {
      v: 1,
      status,
      reason,
      provider: info,
      area,
      requested,
      providerTime: null,
      servedAt: now(),
      cache: 'none',
      retryAfterS,
      count: 0,
      stats: null,
      aircraft: [],
    };
    return json(body, httpStatus, cors, { 'Retry-After': String(retryAfterS) });
  }

  async function handleAircraft(url: URL, cors: CorsDecision, ctx?: WaitUntilContext) {
    const parsed = parseAreaParams(url.searchParams);
    if (!parsed.ok) {
      return json(errorBody('invalid_params', parsed.message, { field: parsed.field }), 400, cors);
    }
    const { requested, area } = parsed;

    const open = breaker.current();
    if (open) {
      const retryAfterS = Math.max(1, Math.ceil(breaker.remainingMs() / 1000));
      // Circuito aperto: nessuna chiamata upstream, 503 con il motivo originale.
      return failureResponse(cors, 503, open.status, open.reason, retryAfterS, requested, area);
    }

    try {
      const { value, cache: outcome } = await cache.getOrLoad(
        areaCacheKey(area),
        () => throttle.run(() => deps.provider.fetchArea(area)),
        (p) => ctx?.waitUntil(p.catch(() => undefined)),
      );
      if (outcome === 'miss') {
        lastUpstream = {
          ok: true,
          at: now(),
          reason: null,
          httpStatus: 200,
          upstreamMs: value.upstreamMs,
          upstreamBytes: value.upstreamBytes,
          count: value.aircraft.length,
        };
      }
      const body: AircraftResponse = {
        v: 1,
        status: 'ok',
        reason: null,
        provider: info,
        area,
        requested,
        providerTime: value.providerTime,
        servedAt: now(),
        cache: outcome,
        retryAfterS: null,
        count: value.aircraft.length,
        stats: value.stats,
        aircraft: value.aircraft,
      };
      const extra: Record<string, string> = {
        'Cache-Control': `public, max-age=${SUCCESS_BROWSER_MAX_AGE_S}`,
        'X-EarthRadar-Cache': outcome,
      };
      if (outcome === 'miss') {
        extra['Server-Timing'] =
          `upstream;dur=${value.upstreamMs}, normalize;dur=${value.normalizeMs}`;
      }
      return json(body, 200, cors, extra);
    } catch (err) {
      if (err instanceof ThrottleBusyError) {
        // Nessuna chiamata upstream fatta: niente breaker, il client riprova a breve.
        const retryAfterS = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
        return failureResponse(
          cors,
          503,
          'rate_limited',
          'gateway_busy',
          retryAfterS,
          requested,
          area,
        );
      }
      if (!(err instanceof UpstreamError)) throw err;
      const failure = classifyUpstreamError(err);
      breaker.trip(failure);
      lastUpstream = {
        ok: false,
        at: now(),
        reason: failure.reason,
        httpStatus: err.httpStatus,
        upstreamMs: null,
        upstreamBytes: null,
        count: null,
      };
      const retryAfterS = Math.max(1, Math.ceil(failure.pauseMs / 1000));
      return failureResponse(
        cors,
        failure.httpStatus,
        failure.status,
        failure.reason,
        retryAfterS,
        requested,
        area,
      );
    }
  }

  function handleHealth(cors: CorsDecision): Response {
    const open = breaker.current();
    return json(
      {
        v: 1,
        ok: open === null,
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        provider: info,
        // Stato per isolate: istanze diverse possono riportare valori diversi.
        scope: 'isolate',
        breaker: open
          ? {
              open: true,
              status: open.status,
              reason: open.reason,
              retryAfterS: Math.ceil(breaker.remainingMs() / 1000),
            }
          : { open: false },
        lastUpstream,
        cache: { entries: cache.size, ttlS: (deps.cacheTtlMs ?? CACHE_TTL_MS) / 1000 },
        servedAt: now(),
      },
      200,
      cors,
    );
  }

  async function route(request: Request, ctx?: WaitUntilContext): Promise<Response> {
    const cors = decideCors(request, deps.allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (cors.kind === 'denied')
        return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
      return new Response(null, { status: 204, headers: preflightHeaders(cors) });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(errorBody('method_not_allowed', 'Use GET'), 405, cors, {
        Allow: 'GET, HEAD, OPTIONS',
      });
    }
    if (cors.kind === 'denied') {
      return json(errorBody('origin_not_allowed', 'Origin not in allowlist'), 403, cors);
    }

    const url = new URL(request.url);
    switch (url.pathname) {
      case '/v1/aircraft':
        return handleAircraft(url, cors, ctx);
      case '/v1/health':
        return handleHealth(cors);
      default:
        return json(errorBody('not_found', 'Unknown endpoint'), 404, cors);
    }
  }

  return {
    cache,
    breaker,
    async handle(request, ctx) {
      let res: Response;
      try {
        res = await route(request, ctx);
      } catch (err) {
        console.error('aircraft-gateway internal error', err);
        res = new Response(JSON.stringify(errorBody('internal_error', 'Unexpected error')), {
          status: 500,
          headers: { ...BASE_HEADERS, 'Cache-Control': 'no-store', Vary: 'Origin' },
        });
      }
      if (request.method === 'HEAD') {
        return new Response(null, { status: res.status, headers: res.headers });
      }
      return res;
    },
  };
}
