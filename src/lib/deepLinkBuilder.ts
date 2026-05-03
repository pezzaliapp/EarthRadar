/**
 * Costruisce deep link bidirezionali verso le sister app PezzaliAPP.
 *
 * Schemi (allineati con CLAUDE.md decisione 9):
 *   EarthRadar → MeteorWatch  : ?event=<type>&id=<id>          (type: neo|fireball|reentry|iss)
 *   EarthRadar → CubeSat      : ?tle=<base64TLE>&name=<name>   (riusa schema esistente)
 *
 * I servizi (Fase 2+) chiameranno queste funzioni passando i propri payload.
 */

const METEORWATCH_BASE = 'https://www.alessandropezzali.it/MeteorWatch/';
const CUBESAT_BASE = 'https://www.alessandropezzali.it/CubeSat_Constellation/';

export type MeteorWatchEventType = 'neo' | 'fireball' | 'reentry' | 'iss';

export interface TleSet {
  name: string;
  line1: string;
  line2: string;
}

function toBase64Utf8(input: string): string {
  if (typeof window === 'undefined') {
    const g = globalThis as unknown as {
      Buffer?: { from(s: string, enc: string): { toString(enc: string): string } };
    };
    if (g.Buffer) return g.Buffer.from(input, 'utf-8').toString('base64');
  }
  return window.btoa(unescape(encodeURIComponent(input)));
}

export function meteorWatchEventLink(type: MeteorWatchEventType, id?: string): string {
  const params = new URLSearchParams({ event: type });
  if (id) params.set('id', id);
  return `${METEORWATCH_BASE}?${params.toString()}`;
}

export function meteorWatchHomeLink(): string {
  return METEORWATCH_BASE;
}

export function cubeSatTleLink(tle: TleSet): string {
  const text = `${tle.name}\n${tle.line1}\n${tle.line2}`;
  const encoded = toBase64Utf8(text);
  const params = new URLSearchParams({ tle: encoded, name: tle.name });
  return `${CUBESAT_BASE}?${params.toString()}`;
}

export function cubeSatHomeLink(): string {
  return CUBESAT_BASE;
}
