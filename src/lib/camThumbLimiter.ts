/**
 * Limitatore delle preview di CAM Explorer: al massimo `max` immagini in
 * download contemporaneo. Le richieste in coda possono essere annullate
 * (riga uscita dalla viewport) senza mai partire.
 */

export interface ThumbLimiter {
  /**
   * Accoda `start`; viene chiamato quando si libera uno slot. Ritorna una
   * funzione da chiamare a caricamento concluso (o per annullare).
   */
  request: (start: () => void) => () => void;
  /** Download in corso (per test/diagnostica). */
  active: () => number;
  queued: () => number;
}

interface Waiter {
  start: () => void;
  state: 'queued' | 'running' | 'done';
}

export function createThumbLimiter(max: number): ThumbLimiter {
  let running = 0;
  const queue: Waiter[] = [];

  function pump() {
    while (running < max && queue.length > 0) {
      const w = queue.shift()!;
      if (w.state !== 'queued') continue;
      w.state = 'running';
      running++;
      w.start();
    }
  }

  return {
    request(start) {
      const w: Waiter = { start, state: 'queued' };
      queue.push(w);
      pump();
      return () => {
        if (w.state === 'running') {
          running--;
          w.state = 'done';
          pump();
        } else if (w.state === 'queued') {
          w.state = 'done';
          const i = queue.indexOf(w);
          if (i >= 0) queue.splice(i, 1);
        }
      };
    },
    active: () => running,
    queued: () => queue.filter((w) => w.state === 'queued').length,
  };
}

/** Preview contemporanee massime di CAM Explorer. */
export const CAM_THUMB_MAX_CONCURRENT = 4;

/** Istanza condivisa da tutte le righe di Explorer. */
export const camThumbLimiter = createThumbLimiter(CAM_THUMB_MAX_CONCURRENT);
