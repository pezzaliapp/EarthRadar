import { describe, expect, it } from 'vitest';
import { FpsSampler } from './fpsMonitor';

describe('FpsSampler', () => {
  it('starts as pending with zero samples', () => {
    const s = new FpsSampler();
    expect(s.verdict()).toBe('pending');
    expect(s.sampleCount).toBe(0);
    expect(s.averageFps()).toBe(0);
  });

  it('ignores non-finite or non-positive deltas', () => {
    const s = new FpsSampler();
    s.push(Number.NaN);
    s.push(0);
    s.push(-5);
    expect(s.sampleCount).toBe(0);
  });

  it('reports `slow` when average FPS is below threshold', () => {
    const s = new FpsSampler({ windowMs: 1000, thresholdFps: 25, minSamples: 30 });
    // 50 ms per frame → 20 fps, sotto soglia 25.
    for (let i = 0; i < 30; i++) s.push(50);
    expect(s.averageFps()).toBeCloseTo(20, 1);
    expect(s.verdict()).toBe('slow');
  });

  it('reports `ok` when average FPS is above threshold', () => {
    const s = new FpsSampler({ windowMs: 1000, thresholdFps: 25, minSamples: 30 });
    // 16.67 ms per frame → ~60 fps, sopra soglia.
    for (let i = 0; i < 60; i++) s.push(16.67);
    expect(s.averageFps()).toBeGreaterThan(55);
    expect(s.verdict()).toBe('ok');
  });

  it('stays `pending` if we have enough samples but window not reached', () => {
    // 32 frame da 1ms l'uno = 32ms accumulati, finestra 1000ms non raggiunta.
    const s = new FpsSampler({ windowMs: 1000, thresholdFps: 25, minSamples: 30 });
    for (let i = 0; i < 32; i++) s.push(1);
    expect(s.sampleCount).toBe(32);
    expect(s.verdict()).toBe('pending');
  });

  it('stays `pending` if window reached but minSamples not', () => {
    const s = new FpsSampler({ windowMs: 1000, thresholdFps: 25, minSamples: 30 });
    // 5 frame da 250ms = 1250ms accumulati ma solo 5 sample.
    for (let i = 0; i < 5; i++) s.push(250);
    expect(s.verdict()).toBe('pending');
  });

  it('reset() drops all samples', () => {
    const s = new FpsSampler({ windowMs: 100, thresholdFps: 25, minSamples: 5 });
    for (let i = 0; i < 10; i++) s.push(50);
    expect(s.verdict()).toBe('slow');
    s.reset();
    expect(s.sampleCount).toBe(0);
    expect(s.verdict()).toBe('pending');
  });
});
