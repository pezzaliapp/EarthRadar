// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EdgeCache } from '../src/edgeCache.ts';
import { FakeEdgeStore } from './fakeEdgeStore.ts';

function setup() {
  let now = 1_000_000;
  const store = new FakeEdgeStore(() => now);
  const edge = new EdgeCache({
    store,
    keyOrigin: 'https://aircraft.alessandropezzali.it/',
    keyPrefix: '/__cache/v2/',
    providerId: 'flyitalyadsb',
    retainS: 150,
    now: () => now,
  });
  return { edge, store, advance: (ms: number) => (now += ms), now: () => now };
}

describe('EdgeCache', () => {
  it('chiavi sintetiche costruite solo dall’area quantizzata', () => {
    const { edge } = setup();
    expect(edge.snapshotKey('45,7.5,150')).toBe(
      'https://aircraft.alessandropezzali.it/__cache/v2/flyitalyadsb/aircraft/45/7.5/150',
    );
    expect(edge.lockKey('-33.5,-70.25,25')).toBe(
      'https://aircraft.alessandropezzali.it/__cache/v2/flyitalyadsb/aircraft/-33.5/-70.25/25/lock',
    );
    expect(edge.breakerKey()).toBe(
      'https://aircraft.alessandropezzali.it/__cache/v2/flyitalyadsb/breaker',
    );
  });

  it('snapshot: round trip e scadenza dopo freschezza + stale', async () => {
    const t = setup();
    const snap = { body: '{"v":1}', fetchedAt: t.now(), count: 3 };
    await t.edge.putSnapshot('k', snap);
    expect(await t.edge.getSnapshot('k')).toEqual(snap);
    t.advance(150_000);
    expect(await t.edge.getSnapshot('k')).toBeNull();
  });

  it('lock: il primo lo prende, il secondo no, poi scade', async () => {
    const t = setup();
    expect(await t.edge.tryAcquireRefreshLock('k', 8)).toBe(true);
    expect(await t.edge.tryAcquireRefreshLock('k', 8)).toBe(false);
    expect(await t.edge.tryAcquireRefreshLock('altra', 8)).toBe(true);
    t.advance(8_000);
    expect(await t.edge.tryAcquireRefreshLock('k', 8)).toBe(true);
  });

  it('breaker: round trip, scadenza e rifiuto di contenuti non validi', async () => {
    const t = setup();
    const open = {
      status: 'rate_limited',
      reason: 'upstream_429',
      openUntil: t.now() + 30_000,
    } as const;
    await t.edge.putBreaker(open);
    expect(await t.edge.getBreaker()).toEqual(open);
    t.advance(30_000);
    expect(await t.edge.getBreaker()).toBeNull();

    await t.store.put(
      new Request(t.edge.breakerKey()),
      new Response(JSON.stringify({ status: 'ok', reason: 'x', openUntil: t.now() + 9e9 }), {
        headers: { 'Cache-Control': 'max-age=60' },
      }),
    );
    expect(await t.edge.getBreaker()).toBeNull();
  });

  it('senza store (workers.dev, test): tutto no-op, lock sempre disponibile', async () => {
    const edge = new EdgeCache({
      store: null,
      keyOrigin: 'https://x',
      keyPrefix: '/c',
      providerId: 'p',
      retainS: 150,
    });
    expect(edge.enabled).toBe(false);
    await edge.putSnapshot('k', { body: '', fetchedAt: 1, count: 0 });
    expect(await edge.getSnapshot('k')).toBeNull();
    expect(await edge.tryAcquireRefreshLock('k', 8)).toBe(true);
  });
});
