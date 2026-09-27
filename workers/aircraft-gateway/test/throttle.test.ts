// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ThrottleBusyError, UpstreamThrottle } from '../src/throttle.ts';

function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    // Registra le attese senza muovere l'orologio: così le attese calcolate
    // restano relative allo stesso istante di partenza.
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

describe('UpstreamThrottle', () => {
  it('distanzia le chiamate di almeno minIntervalMs', async () => {
    const c = fakeClock();
    const t = new UpstreamThrottle({ minIntervalMs: 1000, maxQueue: 5, ...c });
    const starts: number[] = [];
    await Promise.all(
      [1, 2, 3].map(() =>
        t.run(async () => {
          starts.push(c.now());
        }),
      ),
    );
    expect(c.sleeps).toEqual([1000, 2000]);
    expect(starts[0]).toBe(0);
  });

  it('nessuna attesa se l’intervallo è già trascorso', async () => {
    const c = fakeClock();
    const t = new UpstreamThrottle({ minIntervalMs: 1000, maxQueue: 5, ...c });
    await t.run(async () => 1);
    c.advance(1500);
    await t.run(async () => 2);
    expect(c.sleeps).toEqual([]);
  });

  it('coda piena → ThrottleBusyError senza eseguire la funzione', async () => {
    const c = fakeClock();
    const t = new UpstreamThrottle({ minIntervalMs: 1000, maxQueue: 1, ...c });
    let executed = 0;
    const job = () =>
      t.run(async () => {
        executed += 1;
      });
    const p1 = job();
    const p2 = job(); // attende 1 s (waiting = 1)
    const p3 = job(); // coda piena
    await expect(p3).rejects.toBeInstanceOf(ThrottleBusyError);
    await Promise.all([p1, p2]);
    expect(executed).toBe(2);
    expect(t.waitingCount).toBe(0);
  });
});
