// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { Coalescer, SnapshotMemoryCache, type Snapshot } from '../src/cache.ts';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const snap = (fetchedAt: number, body = `b${fetchedAt}`): Snapshot => ({
  body,
  fetchedAt,
  count: 0,
});

describe('SnapshotMemoryCache', () => {
  it('conserva la voce fino a fetchedAt + retain, calcolato su fetchedAt', () => {
    let now = 1_000;
    const cache = new SnapshotMemoryCache({ retainMs: 150_000, maxEntries: 10, now: () => now });
    // Arrivata dalla Cache API già vecchia di 100 s: non ringiovanisce.
    cache.set('k', snap(now - 100_000));
    now += 50_000;
    expect(cache.get('k')).not.toBeNull();
    now += 1;
    expect(cache.get('k')).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('mantiene sempre la fotografia più recente', () => {
    const cache = new SnapshotMemoryCache({ retainMs: 150_000, maxEntries: 10, now: () => 10 });
    cache.set('k', snap(5, 'nuova'));
    cache.set('k', snap(3, 'vecchia'));
    expect(cache.get('k')?.body).toBe('nuova');
  });

  it('rispetta maxEntries eliminando le voci più vecchie', () => {
    const cache = new SnapshotMemoryCache({ retainMs: 150_000, maxEntries: 2, now: () => 10 });
    cache.set('a', snap(1));
    cache.set('b', snap(2));
    cache.set('c', snap(3));
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('c')).not.toBeNull();
  });
});

describe('Coalescer', () => {
  it('N richieste concorrenti → 1 solo caricamento', async () => {
    const c = new Coalescer<string>();
    const d = deferred<string>();
    const load = vi.fn(() => d.promise);
    const onStart = vi.fn();
    const calls = [c.run('k', load, onStart), c.run('k', load, onStart), c.run('k', load, onStart)];
    expect(c.inflightCount).toBe(1);
    d.resolve('data');
    const results = await Promise.all(calls);
    expect(load).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.leader)).toEqual([true, false, false]);
    expect(results.every((r) => r.value === 'data')).toBe(true);
    expect(c.inflightCount).toBe(0);
  });

  it('gli errori arrivano a tutti e non bloccano i caricamenti successivi', async () => {
    const c = new Coalescer<string>();
    const d = deferred<string>();
    const a = c.run('k', () => d.promise);
    const b = c.run('k', () => d.promise);
    d.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect((await c.run('k', async () => 'ok')).value).toBe('ok');
  });
});
