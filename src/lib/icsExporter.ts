/**
 * Builder ICS (RFC 5545) minimo per esportare passaggi satellitari come
 * eventi calendario. Supporta solo VEVENT base (DTSTART, DTEND, SUMMARY,
 * DESCRIPTION, LOCATION, UID) sufficienti perché Apple Calendar / Google
 * Calendar / Outlook li importino correttamente.
 */

export interface IcsEvent {
  uid: string;
  start: number;
  end: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
}

const PRODID = '-//EarthRadar//PezzaliAPP//EN';

/** Costruisce il file .ics come stringa. CRLF richiesto da RFC 5545. */
export function buildIcs(events: IcsEvent[]): string {
  const out: string[] = [];
  out.push('BEGIN:VCALENDAR');
  out.push('VERSION:2.0');
  out.push(`PRODID:${PRODID}`);
  out.push('CALSCALE:GREGORIAN');
  out.push('METHOD:PUBLISH');
  for (const evt of events) {
    out.push('BEGIN:VEVENT');
    out.push(`UID:${escapeText(evt.uid)}`);
    out.push(`DTSTAMP:${formatUtcDate(Date.now())}`);
    out.push(`DTSTART:${formatUtcDate(evt.start)}`);
    out.push(`DTEND:${formatUtcDate(evt.end)}`);
    out.push(`SUMMARY:${escapeText(evt.summary)}`);
    if (evt.description) {
      out.push(`DESCRIPTION:${escapeText(evt.description)}`);
    }
    if (evt.location) {
      out.push(`LOCATION:${escapeText(evt.location)}`);
    }
    if (evt.url) {
      out.push(`URL:${evt.url}`);
    }
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

/**
 * Formatta un timestamp UNIX ms come `YYYYMMDDTHHMMSSZ` (UTC, formato basic ISO).
 * Esposto per testabilità.
 */
export function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/** Escape RFC 5545 dei caratteri speciali in TEXT (backslash, comma, semicolon, newline). */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Forza il download di un file .ics nel browser. No-op fuori da contesto DOM.
 * Esposto qui invece di duplicare la logica nei panel.
 */
export function downloadIcs(filename: string, ics: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
