// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/cache.ts';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TtlCache', () => {
  it('miss → hit entro il TTL → miss dopo la scadenza', async () => {
    let now = 1000;
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 10, now: () => now });
    const loader = vi.fn(async () => 42);

    expect(await cache.getOrLoad('k', loader)).toEqual({ value: 42, cache: 'miss' });
    now += 9_999;
    expect(await cache.getOrLoad('k', loader)).toEqual({ value: 42, cache: 'hit' });
    now += 1;
    expect(await cache.getOrLoad('k', loader)).toEqual({ value: 42, cache: 'miss' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('coalescing: N richieste concorrenti → 1 sola chiamata al loader', async () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000, maxEntries: 10 });
    const d = deferred<string>();
    const loader = vi.fn(() => d.promise);
    const onLoad = vi.fn();

    const calls = [
      cache.getOrLoad('k', loader, onLoad),
      cache.getOrLoad('k', loader, onLoad),
      cache.getOrLoad('k', loader, onLoad),
    ];
    expect(cache.inflightCount).toBe(1);
    d.resolve('data');
    const results = await Promise.all(calls);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.cache)).toEqual(['miss', 'coalesced', 'coalesced']);
    expect(results.every((r) => r.value === 'data')).toBe(true);
    expect(cache.inflightCount).toBe(0);
  });

  it('gli errori non vengono memorizzati e arrivano a tutti i richiedenti', async () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000, maxEntries: 10 });
    const d = deferred<string>();
    const loader = vi.fn(() => d.promise);
    const a = cache.getOrLoad('k', loader);
    const b = cache.getOrLoad('k', loader);
    d.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(cache.size).toBe(0);
    expect(cache.inflightCount).toBe(0);

    const ok = await cache.getOrLoad('k', async () => 'ok');
    expect(ok.cache).toBe('miss');
  });

  it('chiavi diverse non si mescolano; rispetta maxEntries', async () => {
    const cache = new TtlCache<string>({ ttlMs: 10_000, maxEntries: 2 });
    await cache.getOrLoad('a', async () => 'A');
    await cache.getOrLoad('b', async () => 'B');
    await cache.getOrLoad('c', async () => 'C');
    expect(cache.size).toBe(2);
    expect((await cache.getOrLoad('c', async () => 'x')).cache).toBe('hit');
    expect((await cache.getOrLoad('a', async () => 'A2')).value).toBe('A2');
  });
});
