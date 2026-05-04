import { mapStateToShareUrl, type ShareableLayerId } from '@/lib/deepLinkBuilder';
import type { LayerSnapshot } from '@/store/layersStore';
import type { ViewMode } from '@/store/settingsStore';

/**
 * Sintetizza l'URL self-share centrato su un punto, usando lo stato corrente
 * dei layer e del view-mode. Esposto puro per essere unit-testato e per
 * eliminare duplicazione nei panel.
 */
export function buildShareUrl(args: {
  lat: number;
  lon: number;
  view: ViewMode;
  overlays: Record<string, LayerSnapshot>;
  zoom?: number;
}): string {
  const activeLayers = Object.entries(args.overlays)
    .filter(([, s]) => s?.enabled)
    .map(([id]) => id) as ShareableLayerId[];
  return mapStateToShareUrl({
    lat: args.lat,
    lon: args.lon,
    view: args.view,
    activeLayers,
    zoom: args.zoom,
  });
}
