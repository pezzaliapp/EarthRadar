import { TileLayer } from 'react-leaflet';
import { useLayersStore } from '@/store/layersStore';
import {
  LIGHTNING_ATTRIBUTION,
  LIGHTNING_MAX_NATIVE_ZOOM,
  lightningTileUrl,
} from '@/services/lightningGibs';

/**
 * Overlay Fulmini — v1.0 (MVP statico).
 *
 * Renderizza il tile LIS/TRMM Full Climatology Mean Flash Rate da GIBS:
 * una mappa globale di densità fulmini media climatologica. Snapshot
 * statico (no isRealTime, niente refresh). Vedi `services/lightningGibs.ts`
 * per la motivazione della scelta sul GLM real-time non esposto da GIBS.
 *
 * v1.1 (futura): sopra questo tile aggiungeremo marker per gli strike
 * live ricevuti da Blitzortung via WebSocket. Per non dover ridisegnare
 * niente esponiamo già qui l'interfaccia `Strike` con i campi tipici di
 * tutti i feed lightning (Vaisala, Blitzortung, NLDN). In v1.0 il prop
 * `liveStrikes` è opzionale e ignorato — quando arriverà il WS
 * Blitzortung il chiamante passerà l'array popolato e LightningLayer
 * renderizzerà CircleMarker animati sopra il tile climatologico.
 */

/**
 * Strike singolo — pronto per WS Blitzortung in v1.1.
 *
 * Campi scelti per copertura cross-feed (Vaisala/NLDN/Blitzortung):
 *  - lat/lon: posizione geografica del flash
 *  - timestamp: ms UNIX del flash
 *  - energy: energia stimata (femtojoules per GLM, kA picco per WS).
 *    null se la sorgente non lo riporta.
 *  - type: 'IC' (intra-cloud), 'CG' (cloud-to-ground), 'unknown'
 */
export interface Strike {
  lat: number;
  lon: number;
  timestamp: number;
  energy: number | null;
  type: 'IC' | 'CG' | 'unknown';
}

interface Props {
  /**
   * Strike live da renderizzare come marker sopra il tile. Vuoto/omesso
   * in v1.0 (MVP statico), popolato dal WS Blitzortung in v1.1.
   */
  liveStrikes?: Strike[];
}

export default function LightningLayer({ liveStrikes }: Props = {}) {
  const enabled = useLayersStore((s) => s.overlays.lightning?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.lightning?.opacity ?? 0.7);

  if (!enabled) return null;

  // v1.1 placeholder: quando `liveStrikes` arriverà popolato, qui sopra il
  // TileLayer aggiungeremo un secondo blocco con CircleMarker animati per
  // ogni strike. Per ora è no-op, garantisce che la prop esista.
  void liveStrikes;

  return (
    <TileLayer
      url={lightningTileUrl()}
      attribution={LIGHTNING_ATTRIBUTION}
      maxNativeZoom={LIGHTNING_MAX_NATIVE_ZOOM}
      maxZoom={9}
      opacity={opacity}
      crossOrigin
      tileSize={256}
    />
  );
}
