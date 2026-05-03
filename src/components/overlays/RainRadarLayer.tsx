import { useMemo } from 'react';
import { TileLayer } from 'react-leaflet';
import { useLayersStore } from '@/store/layersStore';
import { useRadarFrames } from '@/hooks/useRadarFrames';
import { buildTileUrl } from '@/services/rainviewerApi';

/**
 * Tile layer RainViewer per il frame radar attualmente selezionato dal slider.
 * Il `key` cambia con timestamp del frame: Leaflet sostituisce il TileLayer e
 * carica i nuovi tile (i precedenti restano in cache SW per uno scrubbing
 * del slider fluido).
 */
export default function RainRadarLayer() {
  const enabled = useLayersStore((s) => s.overlays.rainviewer?.enabled ?? false);
  const opacity = useLayersStore((s) => s.rainRadarOpacity);
  const frameIndex = useLayersStore((s) => s.rainRadarFrameIndex);
  const { frames } = useRadarFrames(enabled);

  const layer = useMemo(() => {
    if (!frames || frames.all.length === 0) return null;
    const idx = Math.min(frameIndex, frames.all.length - 1);
    const frame = frames.all[idx];
    return {
      url: buildTileUrl(frames.host, frame, { color: 4, smooth: true, snow: true }),
      key: `rainviewer:${frame.time}`,
    };
  }, [frames, frameIndex]);

  if (!enabled || !layer) return null;

  return (
    <TileLayer
      key={layer.key}
      url={layer.url}
      opacity={opacity}
      attribution='Radar by <a href="https://www.rainviewer.com/api.html" target="_blank" rel="noreferrer">RainViewer.com</a>'
      tileSize={256}
      crossOrigin
    />
  );
}
