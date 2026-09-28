import { useCallback, useEffect, useRef, useState } from 'react';
import { startLive, type LiveErrorReason, type LiveHandle, type LiveOptions } from '@/lib/livePlayer';

export type LiveStatus =
  | 'ready' // poster visibile, nessuno stream (mai "LIVE")
  | 'loading' // connessione in corso
  | 'playing' // video in riproduzione → badge 🔴 LIVE
  | 'offline' // errore / stream non disponibile
  | 'stopped-hidden' // fermato perché la pagina non era visibile
  | 'stopped-timeout'; // fermato dopo il tempo massimo

/** Durata massima di una sessione LIVE prima dello stop automatico. */
export const LIVE_MAX_MS = 3 * 60_000;
/** Anticipo con cui compare "Continua LIVE". */
export const LIVE_WARN_BEFORE_MS = 15_000;

export interface LivePlayerState {
  status: LiveStatus;
  errorReason: LiveErrorReason | null;
  /** True negli ultimi secondi prima dello stop automatico. */
  ending: boolean;
  start: () => void;
  stop: () => void;
  /** Rinvia lo stop automatico di altri 3 minuti. */
  extend: () => void;
}

/**
 * Ciclo di vita di UNO stream LIVE legato a un <video>.
 * Timer e listener esistono solo mentre lo stream è in caricamento/riproduzione;
 * allo smontaggio (card chiusa, cambio camera, CAM OFF) tutto viene distrutto.
 * Nessuna ripartenza automatica: dopo ogni stop serve un nuovo tap.
 */
export function useLivePlayer(
  videoRef: React.RefObject<HTMLVideoElement>,
  url: string | null,
  opts?: LiveOptions,
): LivePlayerState {
  const [status, setStatus] = useState<LiveStatus>('ready');
  const [errorReason, setErrorReason] = useState<LiveErrorReason | null>(null);
  const [ending, setEnding] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const handleRef = useRef<LiveHandle | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const teardown = useCallback(() => {
    handleRef.current?.destroy();
    handleRef.current = null;
    setEnding(false);
  }, []);

  const stop = useCallback(() => {
    teardown();
    setStatus('ready');
  }, [teardown]);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video || !url) {
      setErrorReason('offline');
      setStatus('offline');
      return;
    }
    teardown();
    setErrorReason(null);
    setStatus('loading');
    handleRef.current = startLive(
      video,
      url,
      {
        onPlaying: () => {
          setStatus('playing');
          setDeadline(Date.now() + LIVE_MAX_MS);
        },
        onError: (reason) => {
          handleRef.current = null;
          setErrorReason(reason);
          setStatus('offline');
        },
      },
      optsRef.current,
    );
  }, [videoRef, url, teardown]);

  const extend = useCallback(() => {
    setEnding(false);
    setDeadline(Date.now() + LIVE_MAX_MS);
  }, []);

  // Stop automatico dopo LIVE_MAX_MS (timer solo durante la riproduzione).
  useEffect(() => {
    if (status !== 'playing' || deadline === 0) return;
    const left = Math.max(0, deadline - Date.now());
    const warn = window.setTimeout(() => setEnding(true), Math.max(0, left - LIVE_WARN_BEFORE_MS));
    const end = window.setTimeout(() => {
      teardown();
      setStatus('stopped-timeout');
    }, left);
    return () => {
      window.clearTimeout(warn);
      window.clearTimeout(end);
    };
  }, [status, deadline, teardown]);

  // Pagina nascosta → stop completo, nessuna ripartenza automatica al ritorno.
  useEffect(() => {
    if (status !== 'playing' && status !== 'loading') return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        teardown();
        setStatus('stopped-hidden');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [status, teardown]);

  // Smontaggio: distruzione completa.
  useEffect(() => () => teardown(), [teardown]);

  return { status, errorReason, ending, start, stop, extend };
}
