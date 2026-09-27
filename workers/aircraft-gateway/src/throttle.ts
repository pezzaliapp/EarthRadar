/**
 * Distanziatore delle chiamate upstream (per isolate): ogni chiamata parte
 * almeno `minIntervalMs` dopo la precedente. Se troppe sono già in attesa,
 * rifiuta subito con ThrottleBusyError invece di accodare all'infinito.
 * L'attesa è tempo di orologio, non CPU: non pesa sul limite del piano Free.
 */

export class ThrottleBusyError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('upstream throttle queue full');
    this.name = 'ThrottleBusyError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface ThrottleOptions {
  minIntervalMs: number;
  maxQueue: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class UpstreamThrottle {
  private nextSlot = 0;
  private waiting = 0;
  private readonly minIntervalMs: number;
  private readonly maxQueue: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ThrottleOptions) {
    this.minIntervalMs = opts.minIntervalMs;
    this.maxQueue = opts.maxQueue;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get waitingCount(): number {
    return this.waiting;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    const wait = start - now;
    if (wait > 0 && this.waiting >= this.maxQueue) throw new ThrottleBusyError(wait);
    this.nextSlot = start + this.minIntervalMs;
    if (wait > 0) {
      this.waiting += 1;
      try {
        await this.sleep(wait);
      } finally {
        this.waiting -= 1;
      }
    }
    return fn();
  }
}
