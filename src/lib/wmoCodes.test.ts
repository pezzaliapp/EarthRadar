import { describe, expect, it } from 'vitest';
import { wmoEntry, wmoSeverityColor } from './wmoCodes';

describe('wmoEntry', () => {
  it('maps clear sky 0 to ☀️ calm', () => {
    const e = wmoEntry(0);
    expect(e.emoji).toBe('☀️');
    expect(e.i18nKey).toBe('wmo.clear');
    expect(e.severity).toBe('calm');
  });

  it('maps thunderstorm 95 to ⛈️ severe', () => {
    const e = wmoEntry(95);
    expect(e.emoji).toBe('⛈️');
    expect(e.severity).toBe('severe');
  });

  it('maps overcast 3 to ☁️', () => {
    expect(wmoEntry(3).emoji).toBe('☁️');
  });

  it('returns unknown for unmapped codes and null/undefined', () => {
    expect(wmoEntry(123).i18nKey).toBe('wmo.unknown');
    expect(wmoEntry(null).i18nKey).toBe('wmo.unknown');
    expect(wmoEntry(undefined).i18nKey).toBe('wmo.unknown');
  });

  it('snow heavy 75 is severe', () => {
    expect(wmoEntry(75).severity).toBe('severe');
  });

  it('drizzle light 51 is unsettled', () => {
    expect(wmoEntry(51).severity).toBe('unsettled');
  });
});

describe('wmoSeverityColor', () => {
  it('returns ciano for calm, giallo for unsettled, rosso for severe', () => {
    expect(wmoSeverityColor('calm')).toBe('#5cf0ff');
    expect(wmoSeverityColor('unsettled')).toBe('#fbbf24');
    expect(wmoSeverityColor('severe')).toBe('#ef4444');
  });
});
