import { TileLayer } from 'react-leaflet';
import { useLayersStore } from '@/store/layersStore';
import { firmsMapKey } from '@/services/firmsApi';
import { GIBS_BY_ID, gibsTileUrl } from '@/services/gibsLayers';

/**
 * Overlay GIBS Active Fires (MODIS_Fires_All) come fallback automatico quando
 * `VITE_FIRMS_MAP_KEY` non è configurata. È il caso "default" out-of-the-box:
 * l'utente vede comunque dove brucia il mondo, anche se non in NRT.
 *
 * Renderizzato solo quando:
 *   - il layer "firms" è attivo
 *   - la map key FIRMS è assente
 *
 * Quando la key c'è, FireLayer disegna gli hotspot real-time a 375 m e questo
 * overlay sparisce (no doppia visualizzazione).
 */
export default function GibsFiresOverlay() {
  const enabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays.firms?.opacity ?? 1);
  const layer = GIBS_BY_ID['gibs_fires'];
  if (!enabled) return null;
  if (firmsMapKey() !== null) return null; // key c'è → FireLayer si occupa di tutto
  if (!layer) return null;
  const url = gibsTileUrl(layer);
  return (
    <TileLayer
      url={url}
      attribution={layer.attribution}
      opacity={opacity * 0.85}
      maxNativeZoom={layer.maxZoom}
      maxZoom={9}
      crossOrigin
    />
  );
}
