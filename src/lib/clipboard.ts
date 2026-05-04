/**
 * Helper di share + clipboard, isolati per essere unit-testati.
 *
 * Strategia
 *  1. Web Share API (`navigator.share`): solo se supportato E `canShare`
 *     accetta il payload. Se l'utente annulla (`AbortError`), restituiamo
 *     `'cancelled'`: NON è un errore.
 *  2. Clipboard API (`navigator.clipboard.writeText`): fallback HTTPS / SW.
 *  3. `document.execCommand('copy')`: ultimo fallback per contesti legacy
 *     (es. localhost senza secure context, vecchi WebView).
 */

export interface SharePayload {
  title?: string;
  text?: string;
  url: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

interface ShareCapableNavigator extends Navigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

export async function tryNativeShare(payload: SharePayload): Promise<ShareResult | null> {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as ShareCapableNavigator;
  if (!nav.share) return null;
  // Se canShare è esposto, rispettalo: alcune piattaforme lanciano se la
  // shape è richiesta (es. file). Per testo + url va sempre bene.
  if (typeof nav.canShare === 'function' && !nav.canShare(payload)) return null;
  try {
    await nav.share(payload);
    return 'shared';
  } catch (err) {
    // Web Share API: AbortError = user dismissed. Niente messaggio d'errore.
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through al fallback execCommand
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Strategia combinata: prima Web Share, poi clipboard. Restituisce il
 * verdetto finale così il chiamante può mostrare il toast giusto.
 */
export async function shareOrCopy(payload: SharePayload): Promise<ShareResult> {
  const native = await tryNativeShare(payload);
  if (native === 'shared' || native === 'cancelled') return native;
  // null (no api) o 'failed' (errore non-abort) → cade su clipboard.
  const ok = await copyToClipboard(payload.url);
  return ok ? 'copied' : 'failed';
}
