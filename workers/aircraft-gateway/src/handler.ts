import { areaCacheKey, parseAreaParams } from './area.ts';
import { classifyUpstreamError, CircuitBreaker, type OpenCircuit } from './breaker.ts';
import { Coalescer, SnapshotMemoryCache, type Snapshot } from './cache.ts';
import {
  CACHE_FRESH_TTL_S,
  CACHE_MAX_ENTRIES,
  CACHE_STALE_S,
  EDGE_CACHE_KEY_ORIGIN,
  EDGE_CACHE_KEY_PREFIX,
  REFRESH_LOCK_S,
  REFRESH_WAIT_STEP_MS,
  REFRESH_WAIT_STEPS,
  SERVICE_NAME,
  SERVICE_VERSION,
  UPSTREAM_MAX_QUEUE,
  UPSTREAM_MIN_INTERVAL_MS,
} from './config.ts';
import { corsHeaders, decideCors, preflightHeaders, type CorsDecision } from './cors.ts';
import { EdgeCache, type EdgeCacheStore } from './edgeCache.ts';
import {
  UpstreamError,
  type AircraftProvider,
  type ProviderFetchResult,
} from './providers/types.ts';
import { ThrottleBusyError, UpstreamThrottle } from './throttle.ts';
import type {
  AircraftResponse,
  Area,
  CacheOutcome,
  GatewayReason,
  GatewayStatus,
} from './types.ts';

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface GatewayDeps {
  provider: AircraftProvider;
  allowedOrigins: ReadonlySet<string>;
  /** `caches.default` in produzione; null se non disponibile (test, Node). */
  edgeStore?: EdgeCacheStore | null;
  edgeKeyOrigin?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  freshTtlS?: number;
  staleS?: number;
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

interface Failure {
  httpStatus: number;
  status: Exclude<GatewayStatus, 'ok'>;
  reason: GatewayReason;
  retryAfterS: number;
}

/** Motivo per cui si serve una fotografia oltre la freschezza. */
type StaleReason = GatewayReason | 'refreshing';

type LoadResult =
  | { kind: 'snapshot'; snapshot: Snapshot; outcome: 'edge' | 'miss' }
  | { kind: 'stale'; snapshot: Snapshot; staleReason: StaleReason; retryAfterS: number }
  | { kind: 'failure'; failure: Failure };

export interface Gateway {
  handle(request: Request, ctx?: WaitUntilContext): Promise<Response>;
  /** Solo per test. */
  readonly memory: SnapshotMemoryCache;
  readonly edge: EdgeCache;
  readonly breaker: CircuitBreaker;
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGateway(deps: GatewayDeps): Gateway {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const freshTtlS = deps.freshTtlS ?? CACHE_FRESH_TTL_S;
  const staleS = deps.staleS ?? CACHE_STALE_S;
  const freshMs = freshTtlS * 1000;
  const info = deps.provider.info;

  const memory = new SnapshotMemoryCache({
    retainMs: (freshTtlS + staleS) * 1000,
    maxEntries: CACHE_MAX_ENTRIES,
    now,
  });
  const edge = new EdgeCache({
    store: deps.edgeStore ?? null,
    keyOrigin: deps.edgeKeyOrigin ?? EDGE_CACHE_KEY_ORIGIN,
    keyPrefix: EDGE_CACHE_KEY_PREFIX,
    providerId: info.id,
    retainS: freshTtlS + staleS,
    now,
  });
  const coalescer = new Coalescer<LoadResult>();
  const breaker = new CircuitBreaker(now);
  const throttle =
    deps.throttle ??
    new UpstreamThrottle({
      minIntervalMs: UPSTREAM_MIN_INTERVAL_MS,
      maxQueue: UPSTREAM_MAX_QUEUE,
      now,
    });
  let lastUpstream: LastUpstream | null = null;

  const isFresh = (s: Snapshot) => now() - s.fetchedAt < freshMs;
  const newest = (a: Snapshot | null, b: Snapshot | null) =>
    !a ? b : !b ? a : a.fetchedAt >= b.fetchedAt ? a : b;
  const secondsUntil = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

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

  function buildSnapshot(area: Area, value: ProviderFetchResult): Snapshot {
    const fetchedAt = now();
    const body: AircraftResponse = {
      v: 1,
      status: 'ok',
      reason: null,
      provider: info,
      area,
      providerTime: value.providerTime,
      fetchedAt,
      ttlS: freshTtlS,
      retryAfterS: null,
      count: value.aircraft.length,
      stats: value.stats,
      aircraft: value.aircraft,
    };
    return { body: JSON.stringify(body), fetchedAt, count: value.aircraft.length };
  }

  /** Il corpo è servito byte per byte: le informazioni per richiesta stanno negli header. */
  function snapshotResponse(
    snapshot: Snapshot,
    outcome: CacheOutcome,
    cors: CorsDecision,
    stale?: { reason: StaleReason; retryAfterS: number },
  ): Response {
    const ageS = Math.max(0, Math.floor((now() - snapshot.fetchedAt) / 1000));
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      ...corsHeaders(cors),
      // Standard HTTP: il browser considera la risposta fresca per max-age − Age.
      'Cache-Control': stale ? 'no-store' : `public, max-age=${freshTtlS}`,
      Age: String(ageS),
      'X-EarthRadar-Cache': outcome,
    };
    if (stale) {
      headers['X-EarthRadar-Stale-Reason'] = stale.reason;
      headers['Retry-After'] = String(stale.retryAfterS);
    }
    return new Response(snapshot.body, { status: 200, headers });
  }

  function failureResponse(failure: Failure, area: Area, cors: CorsDecision): Response {
    const body: AircraftResponse = {
      v: 1,
      status: failure.status,
      reason: failure.reason,
      provider: info,
      area,
      providerTime: null,
      fetchedAt: null,
      ttlS: freshTtlS,
      retryAfterS: failure.retryAfterS,
      count: 0,
      stats: null,
      aircraft: [],
    };
    return json(body, failure.httpStatus, cors, {
      'Retry-After': String(failure.retryAfterS),
      'X-EarthRadar-Cache': 'none',
    });
  }

  function circuitFailure(open: OpenCircuit): Failure {
    return {
      httpStatus: 503,
      status: open.status,
      reason: open.reason,
      retryAfterS: secondsUntil(open.openUntil - now()),
    };
  }

  function staleOr(stale: Snapshot | null, failure: Failure, reason?: StaleReason): LoadResult {
    if (stale) {
      return {
        kind: 'stale',
        snapshot: stale,
        staleReason: reason ?? failure.reason,
        retryAfterS: failure.retryAfterS,
      };
    }
    return { kind: 'failure', failure };
  }

  /** Attende che un altro isolate pubblichi la fotografia (solo a freddo, lock altrui). */
  async function waitForPeer(key: string): Promise<Snapshot | null> {
    for (let i = 0; i < REFRESH_WAIT_STEPS; i += 1) {
      await sleep(REFRESH_WAIT_STEP_MS);
      const s = await edge.getSnapshot(key);
      if (s && isFresh(s)) return s;
    }
    return null;
  }

  async function load(
    key: string,
    area: Area,
    memStale: Snapshot | null,
    ctx?: WaitUntilContext,
  ): Promise<LoadResult> {
    // 1. Cache API del data center: un altro isolate può averla già aggiornata.
    const edgeSnap = await edge.getSnapshot(key);
    if (edgeSnap) {
      memory.set(key, edgeSnap);
      if (isFresh(edgeSnap)) return { kind: 'snapshot', snapshot: edgeSnap, outcome: 'edge' };
    }
    const stale = newest(memStale, edgeSnap);

    // 2. Breaker locale, poi quello condiviso dagli altri isolate.
    let open = breaker.current();
    if (!open) {
      const shared = await edge.getBreaker();
      if (shared) {
        breaker.adopt(shared);
        open = breaker.current();
      }
    }
    if (open) return staleOr(stale, circuitFailure(open));

    // 3. Un solo isolate per data center aggiorna una data area.
    if (!(await edge.tryAcquireRefreshLock(key, REFRESH_LOCK_S))) {
      const busy: Failure = {
        httpStatus: 503,
        status: 'rate_limited',
        reason: 'gateway_busy',
        retryAfterS: 2,
      };
      if (stale) return staleOr(stale, busy, 'refreshing');
      const peer = await waitForPeer(key);
      if (peer) {
        memory.set(key, peer);
        return { kind: 'snapshot', snapshot: peer, outcome: 'edge' };
      }
      return { kind: 'failure', failure: busy };
    }

    // 4. Chiamata upstream.
    try {
      const value = await throttle.run(() => deps.provider.fetchArea(area));
      const snapshot = buildSnapshot(area, value);
      memory.set(key, snapshot);
      const put = edge.putSnapshot(key, snapshot);
      if (ctx) ctx.waitUntil(put);
      else await put;
      lastUpstream = {
        ok: true,
        at: snapshot.fetchedAt,
        reason: null,
        httpStatus: 200,
        upstreamMs: value.upstreamMs,
        upstreamBytes: value.upstreamBytes,
        count: snapshot.count,
      };
      return { kind: 'snapshot', snapshot, outcome: 'miss' };
    } catch (err) {
      if (err instanceof ThrottleBusyError) {
        // Nessuna chiamata upstream fatta: niente breaker.
        return staleOr(stale, {
          httpStatus: 503,
          status: 'rate_limited',
          reason: 'gateway_busy',
          retryAfterS: secondsUntil(err.retryAfterMs),
        });
      }
      if (!(err instanceof UpstreamError)) throw err;
      const failure = classifyUpstreamError(err);
      breaker.trip(failure);
      const tripped = breaker.current();
      if (tripped) {
        const put = edge.putBreaker(tripped);
        if (ctx) ctx.waitUntil(put);
        else await put;
      }
      lastUpstream = {
        ok: false,
        at: now(),
        reason: failure.reason,
        httpStatus: err.httpStatus,
        upstreamMs: null,
        upstreamBytes: null,
        count: null,
      };
      return staleOr(stale, {
        httpStatus: failure.httpStatus,
        status: failure.status,
        reason: failure.reason,
        retryAfterS: secondsUntil(failure.pauseMs),
      });
    }
  }

  async function handleAircraft(url: URL, cors: CorsDecision, ctx?: WaitUntilContext) {
    const parsed = parseAreaParams(url.searchParams);
    if (!parsed.ok) {
      return json(errorBody('invalid_params', parsed.message, { field: parsed.field }), 400, cors);
    }
    const { area } = parsed;
    const key = areaCacheKey(area);

    const mem = memory.get(key);
    if (mem && isFresh(mem)) return snapshotResponse(mem, 'hit', cors);

    const { value, leader } = await coalescer.run(
      key,
      () => load(key, area, mem, ctx),
      (p) => ctx?.waitUntil(p.catch(() => undefined)),
    );
    switch (value.kind) {
      case 'snapshot':
        return snapshotResponse(value.snapshot, leader ? value.outcome : 'coalesced', cors);
      case 'stale':
        return snapshotResponse(value.snapshot, 'stale', cors, {
          reason: value.staleReason,
          retryAfterS: value.retryAfterS,
        });
      case 'failure':
        return failureResponse(value.failure, area, cors);
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
        // Stato dell'isolate che risponde: istanze diverse possono riportare valori diversi.
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
        cache: {
          ttlS: freshTtlS,
          staleS,
          memoryEntries: memory.size,
          edge: edge.enabled,
        },
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
    memory,
    edge,
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
