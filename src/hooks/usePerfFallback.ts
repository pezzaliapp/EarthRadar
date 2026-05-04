import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { FpsSampler } from '@/lib/fpsMonitor';

/**
 * Quando il Globe3D è montato, monitora gli FPS via requestAnimationFrame.
 * Dopo 3s di osservazione, se la media è < 25 fps:
 *   - chiama `markPerfFallback()` nello store, che mette `viewMode = '2d'`
 *     e setta `perfFallbackTriggered = true`
 *   - il check NON viene più triggerato in futuro fino a un reset esplicito,
 *     perché se l'utente clicca esplicitamente "Globo 3D" dopo aver visto
 *     l'avviso, vogliamo rispettare la sua scelta consapevole.
 *
 * Il hook è no-op fuori da contesto browser (SSR safe) e non interferisce
 * con il rendering normale: usa solo RAF del browser.
 */
export function usePerfFallback(active: boolean): void {
  const markPerfFallback = useSettingsStore((s) => s.markPerfFallback);
  const alreadyTriggered = useSettingsStore((s) => s.perfFallbackTriggered);
  const samplerRef = useRef<FpsSampler | null>(null);

  useEffect(() => {
    if (!active || alreadyTriggered) return;
    if (typeof window === 'undefined') return;
    if (typeof window.requestAnimationFrame !== 'function') return;

    const sampler = new FpsSampler();
    samplerRef.current = sampler;
    let prev = performance.now();
    let raf = 0;
    let stopped = false;

    function tick(now: number) {
      if (stopped) return;
      sampler.push(now - prev);
      prev = now;
      const v = sampler.verdict();
      if (v === 'slow') {
        stopped = true;
        markPerfFallback();
        return;
      }
      if (v === 'ok') {
        stopped = true;
        return;
      }
      raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
    };
  }, [active, alreadyTriggered, markPerfFallback]);
}
