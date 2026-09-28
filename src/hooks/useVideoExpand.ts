import { useCallback, useEffect, useState } from 'react';

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export interface VideoExpandState {
  expanded: boolean;
  expand: () => void;
  collapse: () => void;
  /** True se è disponibile uno schermo intero nativo (Fullscreen API o video iOS). */
  fullscreenSupported: boolean;
  enterFullscreen: () => void;
}

function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function exitFullscreen(): void {
  const d = document as FsDocument;
  if (!fullscreenElement()) return;
  try {
    void (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
  } catch {
    /* già uscito */
  }
}

/**
 * Vista ingrandita del video LIVE, SENZA secondo stream: il contenitore dello
 * stesso <video> diventa un overlay a tutto schermo (solo CSS, nessuno
 * spostamento o duplicazione dell'elemento). Opzionale: schermo intero nativo.
 *
 *  - ESC chiude SOLO la vista grande (non la CamCard).
 *  - Se lo stream smette di essere attivo (`active` false) la vista si chiude.
 *  - Listener e blocco dello scroll esistono solo a vista aperta.
 */
export function useVideoExpand(
  containerRef: React.RefObject<HTMLElement>,
  videoRef: React.RefObject<HTMLVideoElement>,
  active: boolean,
): VideoExpandState {
  const [expanded, setExpanded] = useState(false);

  const collapse = useCallback(() => {
    exitFullscreen();
    setExpanded(false);
  }, []);
  const expand = useCallback(() => setExpanded(true), []);

  // Stream fermato / card chiusa → la vista grande non ha più senso.
  useEffect(() => {
    if (!active && expanded) collapse();
  }, [active, expanded, collapse]);

  // ESC: in cattura, così non raggiunge l'handler che chiude la CamCard.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      collapse();
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded, collapse]);

  // Smontaggio a schermo intero: esci dallo schermo intero.
  useEffect(() => () => exitFullscreen(), []);

  const el = containerRef.current as FsElement | null;
  const video = videoRef.current as IosVideo | null;
  const fullscreenSupported =
    typeof document !== 'undefined' &&
    (!!(el?.requestFullscreen || el?.webkitRequestFullscreen) ||
      typeof video?.webkitEnterFullscreen === 'function');

  const enterFullscreen = useCallback(() => {
    const c = containerRef.current as FsElement | null;
    const v = videoRef.current as IosVideo | null;
    try {
      if (c?.requestFullscreen) void c.requestFullscreen();
      else if (c?.webkitRequestFullscreen) void c.webkitRequestFullscreen();
      // iPhone: solo il player nativo del <video> (stesso elemento, stesso stream).
      else if (typeof v?.webkitEnterFullscreen === 'function') v.webkitEnterFullscreen();
    } catch {
      /* schermo intero negato: resta la vista grande */
    }
  }, [containerRef, videoRef]);

  return { expanded, expand, collapse, fullscreenSupported, enterFullscreen };
}
