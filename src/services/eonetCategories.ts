/**
 * Catalogo statico delle categorie EONET v3.
 * Ogni categoria ha:
 *  - id (string slug come `wildfires`, `severeStorms`, ...)
 *  - emoji icona usata sui marker e nel pannello
 *  - colore principale (per Polygon e tooltip)
 *  - chiave i18n (`eonet.cat.<id>`)
 *
 * Isolato da `eonetApi.ts` per consentire l'import dal layersStore/LayerPanel
 * senza tirare la logica fetch nel main bundle. Stesso pattern di celestrakGroups.
 */

export type EonetSeverity = 'calm' | 'unsettled' | 'severe';

export interface EonetCategorySpec {
  id: string;
  emoji: string;
  color: string;
  severity: EonetSeverity;
  i18nKey: string;
}

/**
 * Lista delle categorie EONET v3 attualmente esposte dall'API.
 * I `severity` e i colori sono editoriali — possiamo affinarli leggendo bbox/source.
 */
export const EONET_CATEGORIES: EonetCategorySpec[] = [
  { id: 'volcanoes', emoji: '🌋', color: '#ef4444', severity: 'severe', i18nKey: 'eonet.cat.volcanoes' },
  { id: 'severeStorms', emoji: '🌀', color: '#ff5cd0', severity: 'severe', i18nKey: 'eonet.cat.severeStorms' },
  { id: 'wildfires', emoji: '🔥', color: '#fb923c', severity: 'severe', i18nKey: 'eonet.cat.wildfires' },
  { id: 'floods', emoji: '🌊', color: '#3b82f6', severity: 'unsettled', i18nKey: 'eonet.cat.floods' },
  { id: 'earthquakes', emoji: '🪨', color: '#fbbf24', severity: 'unsettled', i18nKey: 'eonet.cat.earthquakes' },
  { id: 'landslides', emoji: '⛏️', color: '#92400e', severity: 'unsettled', i18nKey: 'eonet.cat.landslides' },
  { id: 'seaLakeIce', emoji: '🧊', color: '#5cf0ff', severity: 'calm', i18nKey: 'eonet.cat.seaLakeIce' },
  { id: 'drought', emoji: '🏜️', color: '#a16207', severity: 'unsettled', i18nKey: 'eonet.cat.drought' },
  { id: 'dustHaze', emoji: '💨', color: '#a78bfa', severity: 'unsettled', i18nKey: 'eonet.cat.dustHaze' },
  { id: 'manmade', emoji: '🌫️', color: '#9aa3c9', severity: 'unsettled', i18nKey: 'eonet.cat.manmade' },
  { id: 'snow', emoji: '❄️', color: '#bfdbfe', severity: 'calm', i18nKey: 'eonet.cat.snow' },
  { id: 'tempExtremes', emoji: '🌡️', color: '#ef4444', severity: 'severe', i18nKey: 'eonet.cat.tempExtremes' },
  { id: 'waterColor', emoji: '🐟', color: '#34d399', severity: 'calm', i18nKey: 'eonet.cat.waterColor' },
];

const BY_ID = new Map<string, EonetCategorySpec>(EONET_CATEGORIES.map((c) => [c.id, c]));

const UNKNOWN: EonetCategorySpec = {
  id: 'unknown',
  emoji: '❔',
  color: '#9aa3c9',
  severity: 'unsettled',
  i18nKey: 'eonet.cat.unknown',
};

export function eonetCategorySpec(id: string | null | undefined): EonetCategorySpec {
  if (!id) return UNKNOWN;
  return BY_ID.get(id) ?? UNKNOWN;
}
