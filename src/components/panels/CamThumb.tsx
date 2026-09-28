import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { camHasImage, camSnapshotUrl } from '@/services/camSources';
import { camThumbLimiter, type ThumbLimiter } from '@/lib/camThumbLimiter';

type ThumbState = 'idle' | 'loading' | 'ok' | 'error';

interface Props {
  source: string;
  id: string;
  /** Riferimento poster (fonti LIVE): la lista mostra sempre e solo immagini. */
  poster?: string;
  /** Contenitore che scorre (root dell'IntersectionObserver). */
  root: Element | null;
  limiter?: ThumbLimiter;
}

/**
 * Preview di una riga di CAM Explorer.
 *
 *  - Richiesta SOLO quando la riga entra (o sta per entrare) nella viewport
 *    della lista (IntersectionObserver, margine 120 px).
 *  - Download contemporanei limitati (`camThumbLimiter`).
 *  - Se la riga esce prima del caricamento: richiesta annullata/liberata.
 *  - Una sola immagine per riga, nessun polling. Errore → "Non disponibile",
 *    nessun retry automatico; non influenza le altre righe.
 */
export default function CamThumb(props: Props) {
  // Fonti senza immagine (es. GARR.tv): segnaposto neutro, nessuna richiesta.
  if (!camHasImage(props.source)) return <NoImageThumb />;
  return <ImageThumb {...props} />;
}

function NoImageThumb() {
  return (
    <div
      className="grid h-full w-full place-items-center rounded-md border border-space-500/40 bg-space-950 text-[16px] text-space-400"
      aria-hidden
      data-testid="thumb-no-image"
    >
      ▶
    </div>
  );
}

function ImageThumb({ source, id, poster = '', root, limiter = camThumbLimiter }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [state, setStateRaw] = useState<ThumbState>('idle');
  const [src, setSrc] = useState<string | null>(null);
  const stateRef = useRef<ThumbState>('idle');
  const releaseRef = useRef<(() => void) | null>(null);
  const setState = (next: ThumbState) => {
    stateRef.current = next;
    setStateRaw(next);
  };

  // Visibilità nella viewport della lista.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true); // browser senza IO: la virtualizzazione limita già le righe
      return;
    }
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { root, rootMargin: '120px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // Visibile → accoda la richiesta. Uscita dalla viewport (o smontaggio) prima
  // della fine del download → slot liberato e immagine rimossa (download annullato).
  useEffect(() => {
    if (!visible || stateRef.current !== 'idle') return;
    const url = camSnapshotUrl(source, id, Date.now(), poster);
    if (!url) {
      setState('error');
      return;
    }
    const release = limiter.request(() => {
      setSrc(url);
      setState('loading');
    });
    releaseRef.current = release;
    return () => {
      if (stateRef.current === 'ok' || stateRef.current === 'error') return;
      release();
      releaseRef.current = null;
      setSrc(null);
      setState('idle');
    };
  }, [visible, source, id, poster, limiter]);

  const done = (ok: boolean) => {
    releaseRef.current?.();
    releaseRef.current = null;
    setState(ok ? 'ok' : 'error');
  };

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden rounded-md border border-space-500/40 bg-space-950"
    >
      {src && state !== 'error' && (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          onLoad={() => done(true)}
          onError={() => done(false)}
          className={`h-full w-full object-cover transition-opacity ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-1 text-center text-[9px] leading-tight text-space-300">
          {t('cam.thumbUnavailable')}
        </div>
      )}
      {(state === 'idle' || state === 'loading') && (
        <div className="absolute inset-0 grid place-items-center text-[14px] text-space-500" aria-hidden>
          📷
        </div>
      )}
    </div>
  );
}
