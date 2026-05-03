/**
 * Costanti gruppi CelesTrak isolate qui (no import di satellite.js) per consentire
 * a `layersStore.ts` e `LayerPanel.tsx` di importarle senza tirare in bundle
 * `satellite.js` — usato solo dal layer satelliti che è lazy.
 */

export type CelestrakGroup =
  | 'stations'
  | 'starlink'
  | 'gps-ops'
  | 'galileo'
  | 'glo-ops'
  | 'science'
  | 'weather'
  | 'visual';

export interface CelestrakGroupSpec {
  id: CelestrakGroup;
  /** Limite max oggetti restituiti dal gruppo (per perf). Undefined = nessun limite. */
  limit?: number;
}

/** Default groups attivati al primo avvio del layer satellites. */
export const DEFAULT_GROUPS: CelestrakGroup[] = ['stations'];

/** Catalogo dei gruppi disponibili nella UI. */
export const GROUP_CATALOG: CelestrakGroupSpec[] = [
  { id: 'stations' },
  { id: 'visual' },
  { id: 'starlink', limit: 200 },
  { id: 'gps-ops' },
  { id: 'galileo' },
  { id: 'glo-ops' },
  { id: 'science' },
  { id: 'weather' },
];
