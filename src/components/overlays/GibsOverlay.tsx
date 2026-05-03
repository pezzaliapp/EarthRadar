import { useEffect, useMemo, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import { GIBS_BY_ID, gibsTileUrl, type GibsLayer } from '@/services/gibsLayers';
import { useLayersStore, type LayerId } from '@/store/layersStore';

/**
 * Componente generico che renderizza un TileLayer NASA GIBS.
 *
 * - URL costruita via `gibsTileUrl()` rispettando isRealTime / staticDate
 * - opacity letta dal layersStore (default 0.7 per overlay GIBS)
 * - per i layer real-time, sostituisce la `key` ogni `realTimeStepMin`
 *   minuti per forzare Leaflet a ricaricare i tile
 *
 * Si aspetta un `layerId` valido per un layer di categoria `overlay`. Se non
 * trova il layer (es. id sconosciuto) ritorna null silenziosamente.
 */
interface Props {
  layerId: LayerId;
}

export default function GibsOverlay({ layerId }: Props) {
  const enabled = useLayersStore((s) => s.overlays[layerId]?.enabled ?? false);
  const opacity = useLayersStore((s) => s.overlays[layerId]?.opacity ?? 0.7);
  const layer: GibsLayer | undefined = GIBS_BY_ID[layerId];

  // Tick che cambia ogni `realTimeStepMin` minuti per refresh tile.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled || !layer?.isRealTime) return;
    const stepMs = (layer.realTimeStepMin ?? 10) * 60_000;
    const id = window.setInterval(() => setTick(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [enabled, layer?.isRealTime, layer?.realTimeStepMin]);

  const computed = useMemo(() => {
    if (!layer) return null;
    const url = gibsTileUrl(layer);
    const bucket = layer.isRealTime
      ? Math.floor(tick / ((layer.realTimeStepMin ?? 10) * 60_000))
      : 0;
    return {
      url,
      attribution: layer.attribution,
      maxNativeZoom: layer.maxZoom,
      key: `${layer.id}:${bucket}`,
    };
  }, [layer, tick]);

  if (!enabled || !layer || !computed) return null;

  return (
    <TileLayer
      key={computed.key}
      url={computed.url}
      attribution={computed.attribution}
      maxNativeZoom={computed.maxNativeZoom}
      maxZoom={9}
      opacity={opacity}
      crossOrigin
      tileSize={256}
    />
  );
}
