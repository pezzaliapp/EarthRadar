import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useRadarFrames } from '@/hooks/useRadarFrames';
import { frameLabel } from '@/services/rainviewerApi';

const FRAME_INTERVAL_MS = 600;

/**
 * Su smartphone (portrait o landscape a schermo basso) il pannello parte
 * COLLASSATO come chip compatto, così la mappa resta immediatamente leggibile.
 * Su tablet/desktop resta aperto di default (esperienza invariata).
 */
function defaultOpen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  const compact = window.matchMedia('(max-width: 767px), (max-height: 450px)').matches;
  return !compact;
}

/**
 * Controllo temporale RainViewer (slider + play/pause + opacity + attribuzione).
 * Posizionato absolute dentro il container .relative della mappa, angolo
 * basso-destra. Su smartphone è collassabile in un chip "Radar pioggia" per non
 * coprire la mappa; il pulsante "Apri pannello layer" resta in alto a destra,
 * quindi i due controlli non si sovrappongono. Si nasconde se il layer non è
 * attivo o se non ci sono frame.
 */
export default function RainRadarControls() {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
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

  // Stato collassato (default su smartphone): chip compatto sulla mappa.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls="rainradar-panel"
        className="safe-bottom pointer-events-auto absolute bottom-2 right-2 z-[400] inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-cyan-glow/40 bg-space-900/85 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-cyan-glow shadow-glow backdrop-blur-md"
      >
        <span aria-hidden>🌧</span>
        <span>{t('radar.chip')}</span>
      </button>
    );
  }

  return (
    <div
      id="rainradar-panel"
      className="safe-bottom pointer-events-auto absolute bottom-2 right-2 z-[400] w-[min(92vw,360px)] max-w-[calc(100%-1rem)]"
    >
      <div className="glass-strong space-y-2 p-3 text-[11px] text-space-50">
        <div className="flex items-center justify-between gap-2">
          <span className="label text-cyan-glow">{t('radar.title')}</span>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="font-mono text-space-300">{t('radar.loading')}</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('radar.collapse')}
              className="grid h-11 w-11 place-items-center rounded-lg text-space-200 hover:text-cyan-glow sm:h-7 sm:w-7"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-primary h-11 w-14 px-0 text-[11px] sm:h-7 sm:w-12"
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
