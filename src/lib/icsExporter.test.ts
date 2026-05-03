import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, formatUtcDate } from './icsExporter';

describe('formatUtcDate', () => {
  it('formats a known date as YYYYMMDDTHHMMSSZ', () => {
    const ms = Date.parse('2024-09-25T18:30:45Z');
    expect(formatUtcDate(ms)).toBe('20240925T183045Z');
  });

  it('zero-pads months/days/hours below 10', () => {
    const ms = Date.parse('2024-01-05T03:07:09Z');
    expect(formatUtcDate(ms)).toBe('20240105T030709Z');
  });
});

describe('escapeText', () => {
  it('escapes backslash, comma, semicolon, newline', () => {
    expect(escapeText('a, b; c\nd\\e')).toBe('a\\, b\\; c\\nd\\\\e');
  });

  it('leaves plain text intact', () => {
    expect(escapeText('ISS pass over Reggio Emilia')).toBe('ISS pass over Reggio Emilia');
  });
});

describe('buildIcs', () => {
  it('emits a valid VCALENDAR/VEVENT skeleton with CRLF line endings', () => {
    const ics = buildIcs([
      {
        uid: 'iss-2024-09-25T18-30-00@earthradar',
        start: Date.parse('2024-09-25T18:30:00Z'),
        end: Date.parse('2024-09-25T18:36:00Z'),
        summary: 'ISS pass · max 65°',
        description: 'Visibile a NE → SE',
        location: 'Reggio Emilia, IT',
      },
    ]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('UID:iss-2024-09-25T18-30-00@earthradar');
    expect(ics).toContain('DTSTART:20240925T183000Z');
    expect(ics).toContain('DTEND:20240925T183600Z');
    expect(ics).toContain('SUMMARY:ISS pass · max 65°');
    expect(ics).toContain('LOCATION:Reggio Emilia\\, IT');
    expect(ics.split('\r\n').length).toBeGreaterThan(8);
  });

  it('handles multiple events in one file', () => {
    const ics = buildIcs([
      {
        uid: 'a@earthradar',
        start: Date.now(),
        end: Date.now() + 60_000,
        summary: 'A',
      },
      {
        uid: 'b@earthradar',
        start: Date.now() + 3600_000,
        end: Date.now() + 3660_000,
        summary: 'B',
      },
    ]);
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount = (ics.match(/END:VEVENT/g) ?? []).length;
    expect(beginCount).toBe(2);
    expect(endCount).toBe(2);
  });

  it('includes DTSTAMP and PRODID for compliant clients', () => {
    const ics = buildIcs([
      {
        uid: 'x@earthradar',
        start: Date.now(),
        end: Date.now() + 60_000,
        summary: 'x',
      },
    ]);
    expect(ics).toContain('DTSTAMP:');
    expect(ics).toContain('PRODID:-//EarthRadar//PezzaliAPP//EN');
  });
});
