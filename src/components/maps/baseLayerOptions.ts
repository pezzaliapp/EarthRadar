import type { LayerId } from '@/store/layersStore';

/**
 * Opzioni del selettore "mappa base" del LayerPanel.
 * In file separato per non rompere il fast-refresh di SatelliteTileLayer.
 */
export const BASE_LAYER_OPTIONS: Array<{ id: LayerId; labelKey: string }> = [
  { id: 'gibs_viirs_truecolor', labelKey: 'layers.viirs' },
  { id: 'gibs_modis_truecolor', labelKey: 'layers.modis' },
  { id: 'gibs_clouds_geocolor', labelKey: 'layers.geoColor' },
  { id: 'gibs_blackmarble', labelKey: 'layers.blackMarble' },
  { id: 'osm', labelKey: 'layers.osm' },
];
