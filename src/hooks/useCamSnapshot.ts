import { useCallback, useEffect, useRef, useState } from 'react';
import { CAM_SOURCES, camSnapshotUrl, isCamSourceId } from '@/services/camSources';

export type CamSnapshotStatus = 'loading' | 'ok' | 'unavailable';

export interface CamSnapshotState {
  /** URL corrente della preview (host ufficiale in allowlist) o null. */
  src: string | null;
  status: CamSnapshotStatus;
  /** Istante (ms) in cui EarthRadar ha ricevuto l'ultima immagine. */
  loadedAt: number | null;
  onLoad: () => void;
  onError: () => void;
  /** Nuovo tentativo manuale (mai automatico). */
  retry: () => void;
}

/** Oltre questo tempo senza risposta la camera è considerata non disponibile. */
export const CAM_LOAD_TIMEOUT_MS = 20_000;

function pageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * Preview SNAP di UNA camera, pensata per vivere solo dentro la CamCard aperta.
 *
 *  - Refresh all'intervallo conservativo della fonte, SOLO a pagina visibile.
 *  - Pagina nascosta → timer fermo; al ritorno visibile, refresh se scaduto.
 *  - Errore o timeout → "non disponibile", refresh fermo, nessun retry automatico.
 *  - Smontaggio (card chiusa) → timer e listener rimossi subito.
 */
export function useCamSnapshot(source: string, id: string, poster = ''): CamSnapshotState {
  const refreshMs = isCamSourceId(source) ? CAM_SOURCES[source].refreshMs : 0;
  const [src, setSrc] = useState<string | null>(() => camSnapshotUrl(source, id, Date.now(), poster));
  const [status, setStatus] = useState<CamSnapshotStatus>(() => (src ? 'loading' : 'unavailable'));
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [visible, setVisible] = useState(pageVisible);
  const retries = useRef(0);

  // Nuova camera selezionata: ricomincia da capo.
  useEffect(() => {
    const next = camSnapshotUrl(source, id, Date.now(), poster);
    retries.current = 0;
    setSrc(next);
    setStatus(next ? 'loading' : 'unavailable');
    setLoadedAt(null);
  }, [source, id, poster]);

  // Timeout di caricamento: nessuna attesa infinita su un host che non risponde.
  useEffect(() => {
    if (status !== 'loading') return;
    const t = window.setTimeout(() => setStatus('unavailable'), CAM_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [status, src]);

  // Visibilità pagina: listener attivo solo finché la card è montata.
  useEffect(() => {
    const onVisibility = () => setVisible(pageVisible());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Refresh periodico: solo con immagine valida e pagina visibile.
  useEffect(() => {
    if (!visible || status !== 'ok' || refreshMs <= 0) return;
    const tick = () => {
      const next = camSnapshotUrl(source, id, Date.now(), poster);
      // Ignora il marcatore di retry manuale: stessa finestra = stessa immagine.
      setSrc((cur) => (next && next !== cur?.split('&r=')[0] ? next : cur));
    };
    tick(); // al ritorno visibile aggiorna subito se la finestra è scaduta
    const t = window.setInterval(tick, refreshMs);
    return () => window.clearInterval(t);
  }, [visible, status, refreshMs, source, id, poster]);

  const onLoad = useCallback(() => {
    setStatus('ok');
    setLoadedAt(Date.now());
  }, []);

  const onError = useCallback(() => setStatus('unavailable'), []);

  const retry = useCallback(() => {
    const base = camSnapshotUrl(source, id, Date.now(), poster);
    if (!base) return;
    retries.current += 1;
    setSrc(`${base}&r=${retries.current}`);
    setStatus('loading');
  }, [source, id, poster]);

  return { src, status, loadedAt, onLoad, onError, retry };
}
