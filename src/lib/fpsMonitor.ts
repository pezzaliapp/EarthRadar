/**
 * Monitor FPS pure-logic per il fallback automatico Globe3D → Mappa 2D
 * su dispositivi con GPU/CPU lenta.
 *
 * Strategy
 *  - il chiamante (`useFpsFallback`) raccoglie i delta tra `requestAnimation
 *    Frame` consecutivi e li fa scorrere dentro un `FpsSampler`.
 *  - dopo `windowMs` di osservazione (default 3000 ms), `verdict()` ritorna
 *    'ok' (≥ thresholdFps) | 'slow' (< thresholdFps) | 'pending' (non
 *    abbiamo ancora abbastanza sample).
 *
 * Esposto come classe testabile pura — niente RAF dentro, così i test
 * possono spararci dentro array di delta sintetici.
 */

export type Verdict = 'pending' | 'ok' | 'slow';

export interface FpsSamplerOpts {
  /** Durata della finestra di osservazione in ms. Default 3000. */
  windowMs?: number;
  /** Soglia FPS sotto la quale dichiariamo `slow`. Default 25. */
  thresholdFps?: number;
  /**
   * Numero minimo di sample (delta tra RAF) prima di pronunciare un verdict
   * `ok` o `slow`. Sotto a questa soglia restiamo `pending`. Default 30.
   */
  minSamples?: number;
}

export class FpsSampler {
  private deltas: number[] = [];
  private accumulatedMs = 0;
  readonly windowMs: number;
  readonly thresholdFps: number;
  readonly minSamples: number;

  constructor(opts: FpsSamplerOpts = {}) {
    this.windowMs = opts.windowMs ?? 3000;
    this.thresholdFps = opts.thresholdFps ?? 25;
    this.minSamples = opts.minSamples ?? 30;
  }

  /** Aggiunge un delta in ms (tempo tra due RAF). */
  push(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.deltas.push(deltaMs);
    this.accumulatedMs += deltaMs;
  }

  /** Numero di sample raccolti. */
  get sampleCount(): number {
    return this.deltas.length;
  }

  /** FPS medio sui sample raccolti (0 se vuoto). */
  averageFps(): number {
    if (this.deltas.length === 0) return 0;
    const avgMs = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
    return 1000 / avgMs;
  }

  /**
   * Verdict corrente.
   *  - `pending` se non abbiamo ancora `minSamples` o `windowMs` di osservazione
   *  - `slow` se mediamente sotto `thresholdFps`
   *  - `ok` altrimenti
   */
  verdict(): Verdict {
    if (this.sampleCount < this.minSamples) return 'pending';
    if (this.accumulatedMs < this.windowMs) return 'pending';
    return this.averageFps() < this.thresholdFps ? 'slow' : 'ok';
  }

  /** Reset (utile fra test o quando si rientra in 3D dopo un fallback). */
  reset(): void {
    this.deltas = [];
    this.accumulatedMs = 0;
  }
}
