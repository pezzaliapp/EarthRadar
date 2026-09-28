import { describe, expect, it, vi } from 'vitest';
import { createThumbLimiter } from './camThumbLimiter';

describe('camThumbLimiter', () => {
  it('non supera mai il massimo di download contemporanei', () => {
    const lim = createThumbLimiter(4);
    const started: number[] = [];
    const releases = Array.from({ length: 10 }, (_, i) => lim.request(() => started.push(i)));
    expect(started).toEqual([0, 1, 2, 3]);
    expect(lim.active()).toBe(4);
    expect(lim.queued()).toBe(6);
    releases[0]();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(lim.active()).toBe(4);
  });

  it('una richiesta annullata in coda non parte mai', () => {
    const lim = createThumbLimiter(1);
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const relA = lim.request(a);
    const relB = lim.request(b);
    lim.request(c);
    relB(); // riga uscita dalla viewport prima del suo turno
    relA();
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('release è idempotente', () => {
    const lim = createThumbLimiter(1);
    const rel = lim.request(() => {});
    rel();
    rel();
    expect(lim.active()).toBe(0);
    const d = vi.fn();
    lim.request(d);
    expect(d).toHaveBeenCalledTimes(1);
    expect(lim.active()).toBe(1);
  });
});
