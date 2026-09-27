import { BREAKER_MS } from './config.ts';
import type { UpstreamError } from './providers/types.ts';
import type { GatewayReason, GatewayStatus } from './types.ts';

/**
 * Circuit breaker per isolate: dopo un errore upstream smettiamo di chiamare
 * ADSB.lol per un intervallo, rispondendo subito con lo stato noto.
 * Protegge un servizio gratuito da martellamenti durante un disservizio.
 */

export interface UpstreamFailure {
  httpStatus: number;
  status: Exclude<GatewayStatus, 'ok'>;
  reason: GatewayReason;
  pauseMs: number;
}

export function classifyUpstreamError(err: UpstreamError): UpstreamFailure {
  switch (err.kind) {
    case 'rate_limited': {
      const requested = err.retryAfterMs ?? BREAKER_MS.rateLimitedDefault;
      const pauseMs = Math.min(
        BREAKER_MS.rateLimitedMax,
        Math.max(BREAKER_MS.rateLimitedMin, requested),
      );
      return { httpStatus: 503, status: 'rate_limited', reason: 'upstream_429', pauseMs };
    }
    case 'http_5xx':
      return {
        httpStatus: 502,
        status: 'unavailable',
        reason: 'upstream_http_5xx',
        pauseMs: BREAKER_MS.http5xx,
      };
    case 'http_4xx':
      return {
        httpStatus: 502,
        status: 'unavailable',
        reason: 'upstream_http_4xx',
        pauseMs: BREAKER_MS.http4xx,
      };
    case 'timeout':
      return {
        httpStatus: 504,
        status: 'unavailable',
        reason: 'upstream_timeout',
        pauseMs: BREAKER_MS.transient,
      };
    case 'network':
      return {
        httpStatus: 502,
        status: 'unavailable',
        reason: 'upstream_network',
        pauseMs: BREAKER_MS.transient,
      };
    case 'invalid':
      return {
        httpStatus: 502,
        status: 'unavailable',
        reason: 'upstream_invalid',
        pauseMs: BREAKER_MS.transient,
      };
  }
}

export interface OpenCircuit {
  status: Exclude<GatewayStatus, 'ok'>;
  reason: GatewayReason;
  openUntil: number;
}

export class CircuitBreaker {
  private open: OpenCircuit | null = null;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Stato aperto corrente, oppure null se si può chiamare l'upstream. */
  current(): OpenCircuit | null {
    if (this.open && this.now() >= this.open.openUntil) this.open = null;
    return this.open;
  }

  remainingMs(): number {
    const o = this.current();
    return o ? Math.max(0, o.openUntil - this.now()) : 0;
  }

  trip(failure: UpstreamFailure): void {
    this.open = {
      status: failure.status,
      reason: failure.reason,
      openUntil: this.now() + failure.pauseMs,
    };
  }

  reset(): void {
    this.open = null;
  }
}
