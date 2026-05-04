import { useCallback, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { shareOrCopy, type SharePayload, type ShareResult } from '@/lib/clipboard';

interface Props {
  /**
   * Sintetizza il payload al momento del click. Lazily-invoked così il
   * caller può usare lo stato corrente (es. URL self-share con i layer
   * attivi del momento, non quelli al mount).
   */
  getPayload: () => SharePayload;
  /** Override etichetta testuale. Se null, mostra solo l'icona. */
  label?: string | null;
  className?: string;
  /** ARIA label se l'etichetta visiva non basta da sola. */
  ariaLabel?: string;
}

/**
 * Bottone di condivisione riusabile. Web Share API + clipboard fallback.
 * Mostra un mini-toast inline `aria-live="polite"` con il verdetto.
 */
export default function ShareButton({ getPayload, label, className, ariaLabel }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ShareResult | 'idle'>('idle');
  const timerRef = useRef<number | null>(null);

  const onClick = useCallback(async () => {
    const result = await shareOrCopy(getPayload());
    setStatus(result);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus('idle'), 2500);
  }, [getPayload]);

  const message =
    status === 'copied'
      ? t('share.copied')
      : status === 'failed'
        ? t('share.failed')
        : null;

  const visualLabel = label === null ? null : (label ?? t('share.label'));

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? t('share.ariaLabel')}
        className="btn-ghost h-7 px-2 py-0 text-[11px]"
      >
        <span aria-hidden="true">⇪</span>
        {visualLabel && <span>{visualLabel}</span>}
      </button>
      {/* aria-live: gli screen reader leggono il toast quando appare. */}
      <span
        role="status"
        aria-live="polite"
        className={`text-[11px] text-cyan-glow transition-opacity ${
          message ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {message ?? ''}
      </span>
    </span>
  );
}
