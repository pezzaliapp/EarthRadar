// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CircuitBreaker, classifyUpstreamError } from '../src/breaker.ts';
import { UpstreamError } from '../src/providers/types.ts';

describe('classifyUpstreamError', () => {
  it('429: rispetta Retry-After entro [5 s, 300 s], default 15 s', () => {
    const e = (ms: number | null) => new UpstreamError('rate_limited', 'x', 429, ms);
    expect(classifyUpstreamError(e(null))).toMatchObject({
      httpStatus: 503,
      status: 'rate_limited',
      reason: 'upstream_429',
      pauseMs: 15_000,
    });
    expect(classifyUpstreamError(e(2_000)).pauseMs).toBe(5_000);
    expect(classifyUpstreamError(e(120_000)).pauseMs).toBe(120_000);
    expect(classifyUpstreamError(e(3_600_000)).pauseMs).toBe(300_000);
  });

  it('mappa gli altri errori', () => {
    const c = (kind: ConstructorParameters<typeof UpstreamError>[0]) =>
      classifyUpstreamError(new UpstreamError(kind, 'x'));
    expect(c('http_5xx')).toMatchObject({ httpStatus: 502, reason: 'upstream_http_5xx' });
    expect(c('http_4xx')).toMatchObject({ httpStatus: 502, reason: 'upstream_http_4xx' });
    expect(c('timeout')).toMatchObject({ httpStatus: 504, reason: 'upstream_timeout' });
    expect(c('network')).toMatchObject({ httpStatus: 502, reason: 'upstream_network' });
    expect(c('invalid')).toMatchObject({ httpStatus: 502, reason: 'upstream_invalid' });
  });
});

describe('CircuitBreaker', () => {
  it('si apre e si richiude da solo alla scadenza', () => {
    let now = 0;
    const b = new CircuitBreaker(() => now);
    expect(b.current()).toBeNull();
    b.trip({
      httpStatus: 502,
      status: 'unavailable',
      reason: 'upstream_http_5xx',
      pauseMs: 30_000,
    });
    expect(b.current()).toMatchObject({ status: 'unavailable', openUntil: 30_000 });
    now = 29_999;
    expect(b.remainingMs()).toBe(1);
    now = 30_000;
    expect(b.current()).toBeNull();
    expect(b.remainingMs()).toBe(0);
  });
});
