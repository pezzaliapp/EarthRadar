import { useEffect, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useRadarFrames } from '@/hooks/useRadarFrames';
import { frameLabel } from '@/services/rainviewerApi';

const FRAME_INTERVAL_MS = 600;

/**
 * Controllo temporale RainViewer (slider + play/pause + opacity).
 * Pensato per essere posizionato absolute dentro il container .relative della mappa,
 * angolo basso-destra. Si nasconde se il layer non è attivo o se non ci sono frame.
 */
export default function RainRadarControls() {
  const { t, language } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.rainviewer?.enabled ?? false);
  const frameIndex = useLayersStore((s) => s.rainRadarFrameIndex);
  const setFrameIndex = useLayersStore((s) => s.setRainRadarFrameIndex);
  const playing = useLayersStore((s) => s.rainRadarPlaying);
  const setPlaying = useLayersStore((s) => s.setRainRadarPlaying);
  const opacity = useLayersStore((s) => s.rainRadarOpacity);
  const setOpacity = useLayersStore((s) => s.setRainRadarOpacity);
  const { frames, loading } = useRadarFrames(enabled);

  // Quando arrivano nuovi frame, allinea l'indice alla posizione "now" se eravamo a 0/oltre.
  useEffect(() => {
    if (!frames || frames.all.length === 0) return;
    if (frameIndex >= frames.all.length) {
      setFrameIndex(frames.nowIndex);
    } else if (frameIndex === 0 && frames.nowIndex > 0) {
      setFrameIndex(frames.nowIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  // Tick autoplay
  useEffect(() => {
    if (!playing || !frames || frames.all.length === 0) return;
    const id = window.setInterval(() => {
      const next = (frameIndex + 1) % frames.all.length;
      setFrameIndex(next);
    }, FRAME_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, frames, frameIndex, setFrameIndex]);

  const currentFrame = useMemo(() => {
    if (!frames || frames.all.length === 0) return null;
    return frames.all[Math.min(frameIndex, frames.all.length - 1)] ?? null;
  }, [frames, frameIndex]);

  if (!enabled) return null;

  return (
    <div className="safe-bottom pointer-events-auto absolute bottom-2 right-2 z-[400] w-[min(92vw,360px)]">
      <div className="glass-strong space-y-2 p-3 text-[11px] text-space-50">
        <div className="flex items-center justify-between gap-2">
          <span className="label text-cyan-glow">{t('radar.title')}</span>
          {loading && (
            <span className="font-mono text-space-300">{t('radar.loading')}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-primary h-7 w-12 px-0 text-[11px]"
            onClick={() => setPlaying(!playing)}
            disabled={!frames || frames.all.length === 0}
            aria-pressed={playing}
          >
            {playing ? `⏸ ${t('radar.pause')}` : `▶ ${t('radar.play')}`}
          </button>

          <input
            type="range"
            min={0}
            max={frames ? Math.max(0, frames.all.length - 1) : 0}
            value={frameIndex}
            onChange={(e) => {
              setPlaying(false);
              setFrameIndex(Number(e.target.value));
            }}
            className="flex-1 accent-magenta-glow"
            aria-label={t('radar.frame')}
          />

          <span className="w-16 text-right font-mono text-[11px] text-cyan-glow">
            {currentFrame
              ? frameLabel(currentFrame, Math.floor(Date.now() / 1000), language)
              : '—'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="label flex-shrink-0">{t('radar.opacity')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="flex-1 accent-cyan-glow"
            aria-label={t('radar.opacity')}
          />
          <span className="w-10 text-right font-mono text-[10px] text-space-300">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        <p className="text-[10px] text-space-300">{t('radar.attribution')}</p>
      </div>
    </div>
  );
}
