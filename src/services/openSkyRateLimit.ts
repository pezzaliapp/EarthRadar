/**
 * Stato rate-limit OpenSky per il graceful degrade descritto nella chiarificazione 3.
 *
 * Politica:
 *  - dopo 3 risposte 429 consecutive → cooldown 5 min, stato `saturated`
 *  - dopo il primo cooldown, se accumuliamo altri 3 × 429 → cooldown 15 min
 *  - dopo il secondo cooldown, ogni nuovo strike prolunga di 15 min
 *  - una risposta 200 azzera lo stato (torna a `idle`).
 *
 * Implementato come modulo state-machine isolato per essere testabile senza fetch.
 */

export type RateLimitStatus = 'idle' | 'saturated';

export interface RateLimitState {
  status: RateLimitStatus;
  consecutive429: number;
  cooldownUntilMs: number | null;
  cooldownLevel: 0 | 1 | 2;
  /** Timestamp ultimo cambio di stato — utile per i test e i log. */
  lastUpdatedMs: number;
}

const STRIKE_THRESHOLD = 3;
const FIRST_COOLDOWN_MS = 5 * 60 * 1000;
const NEXT_COOLDOWN_MS = 15 * 60 * 1000;

export function initialRateLimit(now = Date.now()): RateLimitState {
  return {
    status: 'idle',
    consecutive429: 0,
    cooldownUntilMs: null,
    cooldownLevel: 0,
    lastUpdatedMs: now,
  };
}

/** È lecito tentare un fetch ora? */
export function canFetch(state: RateLimitState, now = Date.now()): boolean {
  if (state.cooldownUntilMs == null) return true;
  return now >= state.cooldownUntilMs;
}

/** Quanti millisecondi mancano alla fine del cooldown (0 se nessun cooldown). */
export function remainingCooldownMs(state: RateLimitState, now = Date.now()): number {
  if (state.cooldownUntilMs == null) return 0;
  return Math.max(0, state.cooldownUntilMs - now);
}

/** Una richiesta è andata a buon fine: reset completo. */
export function onSuccess(_state: RateLimitState, now = Date.now()): RateLimitState {
  return initialRateLimit(now);
}

/** Una richiesta ha risposto 429. */
export function on429(state: RateLimitState, now = Date.now()): RateLimitState {
  const consecutive429 = state.consecutive429 + 1;
  if (consecutive429 < STRIKE_THRESHOLD) {
    return {
      ...state,
      consecutive429,
      lastUpdatedMs: now,
    };
  }
  // Strike threshold raggiunto: scatta o si estende il cooldown.
  const nextLevel: 0 | 1 | 2 = state.cooldownLevel === 0 ? 1 : 2;
  const cooldownMs = nextLevel === 1 ? FIRST_COOLDOWN_MS : NEXT_COOLDOWN_MS;
  return {
    status: 'saturated',
    consecutive429: 0, // reset il contatore, contiamo gli strike *durante* il prossimo livello
    cooldownUntilMs: now + cooldownMs,
    cooldownLevel: nextLevel,
    lastUpdatedMs: now,
  };
}

/**
 * Una richiesta ha risposto con un errore non-429 (rete, 500, …).
 * Lo trattiamo come "neutro": non bumpa il contatore 429 ma neanche resetta
 * un eventuale stato saturated già in corso.
 */
export function onOtherError(state: RateLimitState, now = Date.now()): RateLimitState {
  return { ...state, lastUpdatedMs: now };
}

/**
 * Tick: se il cooldown è terminato, torniamo a `idle` mantenendo `cooldownLevel`
 * (così il prossimo strike va a 15 min e non a 5).
 */
export function maybeRecover(state: RateLimitState, now = Date.now()): RateLimitState {
  if (state.status !== 'saturated' || state.cooldownUntilMs == null) return state;
  if (now < state.cooldownUntilMs) return state;
  return {
    ...state,
    status: 'idle',
    consecutive429: 0,
    cooldownUntilMs: null,
    lastUpdatedMs: now,
  };
}
