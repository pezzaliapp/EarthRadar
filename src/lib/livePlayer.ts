/**
 * Player LIVE di CAM — un solo stream video alla volta in tutta l'app.
 *
 *  - Parte SOLO su richiesta esplicita (chiamata da un click).
 *  - HLS nativo in <video> dove disponibile (Safari/iOS); altrove hls.js
 *    (build "light", Apache-2.0) importato dinamicamente SOLO in quel momento.
 *  - Avviare un nuovo stream distrugge il precedente.
 *  - `destroy()` ferma tutto: istanza hls.js, sorgente del <video>, rete.
 *  - Errori: un solo tentativo di recupero per errore media, poi stato
 *    "error". Nessun retry infinito; timeout se il video non parte.
 */

export type LiveErrorReason = 'timeout' | 'network' | 'media' | 'unsupported' | 'offline';

export interface LiveCallbacks {
  onPlaying: () => void;
  onError: (reason: LiveErrorReason) => void;
}

export interface LiveHandle {
  destroy: () => void;
}

export interface LiveOptions {
  /** Tempo massimo per ricevere il primo fotogramma. */
  startTimeoutMs?: number;
  /** Import di hls.js (iniettabile nei test). */
  loadHls?: () => Promise<{ default: HlsCtor }>;
}

/** Sottoinsieme dell'API di hls.js usato qui (tipizzato senza importarlo). */
interface HlsInstance {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  on: (event: string, cb: (event: string, data: HlsErrorData) => void) => void;
  recoverMediaError: () => void;
  destroy: () => void;
}
interface HlsErrorData {
  fatal?: boolean;
  type?: string;
  details?: string;
}
export interface HlsCtor {
  new (config: Record<string, unknown>): HlsInstance;
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}

export const LIVE_START_TIMEOUT_MS = 20_000;
const HLS_MIME = 'application/vnd.apple.mpegurl';

/** Configurazione prudente: pochi retry, buffer corto, qualità adatta al player. */
export const HLS_CONFIG: Readonly<Record<string, unknown>> = {
  enableWorker: true,
  lowLatencyMode: false,
  capLevelToPlayerSize: true,
  startLevel: -1,
  maxBufferLength: 20,
  maxMaxBufferLength: 30,
  backBufferLength: 10,
  manifestLoadingMaxRetry: 1,
  levelLoadingMaxRetry: 2,
  fragLoadingMaxRetry: 2,
};

let active: LiveHandle | null = null;

/** True se esiste uno stream LIVE aperto (per test/diagnostica). */
export function hasActiveLive(): boolean {
  return active !== null;
}

/** Ferma lo stream LIVE eventualmente aperto. */
export function stopActiveLive(): void {
  active?.destroy();
}

export function supportsNativeHls(video: HTMLVideoElement): boolean {
  return typeof video.canPlayType === 'function' && video.canPlayType(HLS_MIME) !== '';
}

const defaultLoadHls = () => import('hls.js/light') as unknown as Promise<{ default: HlsCtor }>;

/**
 * Avvia lo stream `url` nel `video`. Da chiamare in risposta a un'azione
 * dell'utente. Ritorna subito l'handle; lo stato arriva dai callback.
 */
export function startLive(
  video: HTMLVideoElement,
  url: string,
  cb: LiveCallbacks,
  opts: LiveOptions = {},
): LiveHandle {
  stopActiveLive(); // una sola LIVE alla volta
  let destroyed = false;
  let hls: HlsInstance | null = null;
  let recoveredMedia = false;
  const timeoutMs = opts.startTimeoutMs ?? LIVE_START_TIMEOUT_MS;

  const onPlaying = () => {
    window.clearTimeout(timer);
    if (!destroyed) cb.onPlaying();
  };
  const onVideoError = () => fail(hls ? 'media' : 'offline');

  const handle: LiveHandle = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.clearTimeout(timer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onVideoError);
      try {
        hls?.destroy();
      } catch {
        /* già distrutto */
      }
      hls = null;
      try {
        video.pause();
      } catch {
        /* jsdom / media già fermo */
      }
      video.removeAttribute('src');
      try {
        video.load(); // interrompe ogni download residuo della sorgente
      } catch {
        /* jsdom */
      }
      if (active === handle) active = null;
    },
  };

  function fail(reason: LiveErrorReason) {
    if (destroyed) return;
    handle.destroy();
    cb.onError(reason);
  }

  const timer = window.setTimeout(() => fail('timeout'), timeoutMs);
  active = handle;
  video.muted = true; // le camere non hanno audio; consente l'avvio inline su iOS
  video.playsInline = true;
  video.addEventListener('playing', onPlaying);
  video.addEventListener('error', onVideoError);

  if (supportsNativeHls(video)) {
    video.src = url;
    void video.play()?.catch?.(() => {
      /* l'errore reale arriva da 'error' o dal timeout */
    });
    return handle;
  }

  const load = opts.loadHls ?? defaultLoadHls;
  load()
    .then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) {
        fail('unsupported');
        return;
      }
      const instance = new Hls({ ...HLS_CONFIG });
      hls = instance;
      instance.on(Hls.Events.ERROR, (_e, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
          recoveredMedia = true; // un solo tentativo di recupero
          instance.recoverMediaError();
          return;
        }
        fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'network' : 'media');
      });
      instance.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play()?.catch?.(() => {});
      });
      instance.loadSource(url);
      instance.attachMedia(video);
    })
    .catch(() => fail('unsupported'));

  return handle;
}
