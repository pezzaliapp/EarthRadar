import { describe, expect, it } from 'vitest';
import {
  canFetch,
  initialRateLimit,
  maybeRecover,
  on429,
  onSuccess,
  remainingCooldownMs,
} from './openSkyRateLimit';

const T0 = 1_700_000_000_000;
const FIVE_MIN = 5 * 60_000;
const FIFTEEN_MIN = 15 * 60_000;

describe('openSky rate-limit FSM', () => {
  it('starts idle and lets the first fetch through', () => {
    const s = initialRateLimit(T0);
    expect(s.status).toBe('idle');
    expect(canFetch(s, T0)).toBe(true);
    expect(remainingCooldownMs(s, T0)).toBe(0);
  });

  it('does not flip to saturated before 3 consecutive 429s', () => {
    let s = initialRateLimit(T0);
    s = on429(s, T0 + 1);
    s = on429(s, T0 + 2);
    expect(s.status).toBe('idle');
    expect(canFetch(s, T0 + 2)).toBe(true);
    expect(s.consecutive429).toBe(2);
  });

  it('flips to saturated for 5 minutes after 3 consecutive 429s', () => {
    let s = initialRateLimit(T0);
    s = on429(s, T0);
    s = on429(s, T0 + 1);
    s = on429(s, T0 + 2);
    expect(s.status).toBe('saturated');
    expect(s.cooldownLevel).toBe(1);
    expect(canFetch(s, T0 + 2)).toBe(false);
    expect(remainingCooldownMs(s, T0 + 2)).toBe(FIVE_MIN);
  });

  it('recovers to idle after the first cooldown elapses', () => {
    let s = initialRateLimit(T0);
    s = on429(s, T0);
    s = on429(s, T0);
    s = on429(s, T0);
    s = maybeRecover(s, T0 + FIVE_MIN);
    expect(s.status).toBe('idle');
    expect(canFetch(s, T0 + FIVE_MIN)).toBe(true);
  });

  it('extends to 15 min after a second strike sequence (chiarificazione 3)', () => {
    let s = initialRateLimit(T0);
    // 1° giro: 3×429 → cooldown 5 min
    s = on429(s, T0);
    s = on429(s, T0);
    s = on429(s, T0);
    expect(s.cooldownLevel).toBe(1);
    // recovery
    s = maybeRecover(s, T0 + FIVE_MIN);
    expect(s.status).toBe('idle');
    // 2° giro: altri 3×429 → cooldown 15 min
    s = on429(s, T0 + FIVE_MIN);
    s = on429(s, T0 + FIVE_MIN);
    s = on429(s, T0 + FIVE_MIN);
    expect(s.status).toBe('saturated');
    expect(s.cooldownLevel).toBe(2);
    expect(remainingCooldownMs(s, T0 + FIVE_MIN)).toBe(FIFTEEN_MIN);
  });

  it('a successful response resets everything to idle', () => {
    let s = initialRateLimit(T0);
    s = on429(s, T0);
    s = on429(s, T0);
    s = onSuccess(s, T0 + 1);
    expect(s.consecutive429).toBe(0);
    expect(s.status).toBe('idle');
    expect(s.cooldownLevel).toBe(0);
  });
});
