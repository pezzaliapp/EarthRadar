import { describe, expect, it } from 'vitest';
import {
  formatDepth,
  formatDistance,
  formatMagnitude,
  formatRelativeTime,
  quakeMarkerRadius,
  quakeSeverity,
  quakeSeverityColor,
} from './quakeFormatters';

describe('quakeSeverity', () => {
  it('classifies <4 as low', () => {
    expect(quakeSeverity(0)).toBe('low');
    expect(quakeSeverity(3.9)).toBe('low');
  });

  it('classifies 4 ≤ m < 5 as mid', () => {
    expect(quakeSeverity(4)).toBe('mid');
    expect(quakeSeverity(4.99)).toBe('mid');
  });

  it('classifies ≥5 as high', () => {
    expect(quakeSeverity(5)).toBe('high');
    expect(quakeSeverity(8.5)).toBe('high');
  });

  it('maps severity to traffic-light hex color', () => {
    expect(quakeSeverityColor(2)).toBe('#34d399');
    expect(quakeSeverityColor(4.5)).toBe('#fbbf24');
    expect(quakeSeverityColor(7)).toBe('#ef4444');
  });
});

describe('quakeMarkerRadius', () => {
  it('clamps to 4 .. 32 px', () => {
    expect(quakeMarkerRadius(0)).toBeGreaterThanOrEqual(4);
    expect(quakeMarkerRadius(-5)).toBe(4);
    expect(quakeMarkerRadius(20)).toBeLessThanOrEqual(32);
  });

  it('grows monotonically with magnitude', () => {
    const a = quakeMarkerRadius(2);
    const b = quakeMarkerRadius(5);
    const c = quakeMarkerRadius(7);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('formatters', () => {
  it('formatMagnitude rounds to 1 decimal with M prefix', () => {
    expect(formatMagnitude(5.612)).toBe('M 5.6');
    expect(formatMagnitude(NaN)).toBe('—');
  });

  it('formatDepth uses meters under 1 km, km otherwise', () => {
    expect(formatDepth(0.4)).toBe('400 m');
    expect(formatDepth(8.6)).toBe('8.6 km');
  });

  it('formatDistance varies by magnitude bucket', () => {
    expect(formatDistance(0.5)).toBe('500 m');
    expect(formatDistance(45.32)).toBe('45.3 km');
    expect(formatDistance(1234, 'en')).toBe('1,234 km');
  });

  it('formatRelativeTime IT/EN', () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 30_000, now, 'it')).toBe('30s fa');
    expect(formatRelativeTime(now - 90_000, now, 'it')).toBe('2 min fa');
    expect(formatRelativeTime(now - 3600 * 1000 * 5, now, 'en')).toBe('5h ago');
    expect(formatRelativeTime(now - 86_400_000 * 3, now, 'it')).toBe('3g fa');
  });
});
