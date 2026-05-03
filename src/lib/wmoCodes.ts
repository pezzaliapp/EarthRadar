/**
 * Mapping codice WMO Open-Meteo → emoji + label IT/EN + severity.
 * Tabella: https://open-meteo.com/en/docs (sezione "Weather code WMO").
 *
 * Severity:
 *   calm       — sereno, poco nuvoloso
 *   unsettled  — variabile, pioggia leggera, neve leggera, nebbia
 *   severe     — temporali, neve forte, pioggia forte
 */

export type WmoSeverity = 'calm' | 'unsettled' | 'severe';

export interface WmoEntry {
  code: number;
  emoji: string;
  /** Chiave i18n (it/en disponibili in i18n/{lang}.json sotto wmo.<key>). */
  i18nKey: string;
  severity: WmoSeverity;
}

const ENTRIES: WmoEntry[] = [
  { code: 0, emoji: '☀️', i18nKey: 'wmo.clear', severity: 'calm' },
  { code: 1, emoji: '🌤️', i18nKey: 'wmo.mainlyClear', severity: 'calm' },
  { code: 2, emoji: '⛅', i18nKey: 'wmo.partlyCloudy', severity: 'calm' },
  { code: 3, emoji: '☁️', i18nKey: 'wmo.overcast', severity: 'calm' },
  { code: 45, emoji: '🌫️', i18nKey: 'wmo.fog', severity: 'unsettled' },
  { code: 48, emoji: '🌫️', i18nKey: 'wmo.depositingRimeFog', severity: 'unsettled' },
  { code: 51, emoji: '🌦️', i18nKey: 'wmo.drizzleLight', severity: 'unsettled' },
  { code: 53, emoji: '🌦️', i18nKey: 'wmo.drizzleModerate', severity: 'unsettled' },
  { code: 55, emoji: '🌧️', i18nKey: 'wmo.drizzleDense', severity: 'unsettled' },
  { code: 56, emoji: '🌨️', i18nKey: 'wmo.freezingDrizzleLight', severity: 'unsettled' },
  { code: 57, emoji: '🌨️', i18nKey: 'wmo.freezingDrizzleDense', severity: 'severe' },
  { code: 61, emoji: '🌧️', i18nKey: 'wmo.rainSlight', severity: 'unsettled' },
  { code: 63, emoji: '🌧️', i18nKey: 'wmo.rainModerate', severity: 'unsettled' },
  { code: 65, emoji: '🌧️', i18nKey: 'wmo.rainHeavy', severity: 'severe' },
  { code: 66, emoji: '🌨️', i18nKey: 'wmo.freezingRainLight', severity: 'severe' },
  { code: 67, emoji: '🌨️', i18nKey: 'wmo.freezingRainHeavy', severity: 'severe' },
  { code: 71, emoji: '🌨️', i18nKey: 'wmo.snowSlight', severity: 'unsettled' },
  { code: 73, emoji: '🌨️', i18nKey: 'wmo.snowModerate', severity: 'unsettled' },
  { code: 75, emoji: '❄️', i18nKey: 'wmo.snowHeavy', severity: 'severe' },
  { code: 77, emoji: '🌨️', i18nKey: 'wmo.snowGrains', severity: 'unsettled' },
  { code: 80, emoji: '🌦️', i18nKey: 'wmo.rainShowersSlight', severity: 'unsettled' },
  { code: 81, emoji: '🌧️', i18nKey: 'wmo.rainShowersModerate', severity: 'unsettled' },
  { code: 82, emoji: '⛈️', i18nKey: 'wmo.rainShowersViolent', severity: 'severe' },
  { code: 85, emoji: '🌨️', i18nKey: 'wmo.snowShowersSlight', severity: 'unsettled' },
  { code: 86, emoji: '❄️', i18nKey: 'wmo.snowShowersHeavy', severity: 'severe' },
  { code: 95, emoji: '⛈️', i18nKey: 'wmo.thunderstorm', severity: 'severe' },
  { code: 96, emoji: '⛈️', i18nKey: 'wmo.thunderstormHailLight', severity: 'severe' },
  { code: 99, emoji: '⛈️', i18nKey: 'wmo.thunderstormHailHeavy', severity: 'severe' },
];

const BY_CODE = new Map<number, WmoEntry>(ENTRIES.map((e) => [e.code, e]));

const UNKNOWN: WmoEntry = {
  code: -1,
  emoji: '❔',
  i18nKey: 'wmo.unknown',
  severity: 'calm',
};

export function wmoEntry(code: number | null | undefined): WmoEntry {
  if (code == null || !Number.isFinite(code)) return UNKNOWN;
  return BY_CODE.get(code) ?? UNKNOWN;
}

export function wmoSeverityColor(sev: WmoSeverity): string {
  switch (sev) {
    case 'calm':
      return '#5cf0ff';
    case 'unsettled':
      return '#fbbf24';
    case 'severe':
      return '#ef4444';
  }
}
