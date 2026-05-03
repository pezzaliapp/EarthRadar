import { useMemo, useRef } from 'react';
import { TileLayer } from 'react-leaflet';
import type L from 'leaflet';
import { useLayersStore } from '@/store/layersStore';
import { GIBS_BY_ID, gibsTileUrl } from '@/services/gibsLayers';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Tile layer base della mappa. Cambia in base a `baseLayer` di layersStore.
 *  - 'osm'                → OpenStreetMap standard
 *  - 'gibs_*'             → tile NASA GIBS WMTS REST
 *
 * Il `key` cambia con id+date così Leaflet ricarica i tile quando cambia layer
 * o quando il timestamp del layer real-time fa step.
 */
export default function SatelliteTileLayer() {
  const baseLayer = useLayersStore((s) => s.baseLayer);
  const layerOpacity = useLayersStore((s) => s.overlays[baseLayer]?.opacity ?? 1);
  const ref = useRef<L.TileLayer>(null);

  const computed = useMemo(() => {
    if (baseLayer === 'osm') {
      return {
        url: OSM_URL,
        attribution: OSM_ATTR,
        maxNativeZoom: 19,
        maxZoom: 19,
        key: 'osm',
      };
    }
    const def = GIBS_BY_ID[baseLayer];
    if (!def) {
      return {
        url: OSM_URL,
        attribution: OSM_ATTR,
        maxNativeZoom: 19,
        maxZoom: 19,
        key: 'osm-fallback',
      };
    }
    const url = gibsTileUrl(def);
    // Per i layer real-time la url cambia ogni `realTimeStepMin` minuti — il tick
    // del bucket viene incluso nel key per forzare il refresh.
    const tick = def.isRealTime ? Math.floor(Date.now() / ((def.realTimeStepMin ?? 10) * 60_000)) : 0;
    return {
      url,
      attribution: def.attribution,
      maxNativeZoom: def.maxZoom,
      maxZoom: 9,
      key: `${def.id}:${tick}`,
    };
  }, [baseLayer]);

  return (
    <TileLayer
      ref={ref}
      key={computed.key}
      url={computed.url}
      attribution={computed.attribution}
      maxNativeZoom={computed.maxNativeZoom}
      maxZoom={computed.maxZoom}
      opacity={layerOpacity}
      noWrap={false}
      crossOrigin
      tileSize={256}
    />
  );
}

