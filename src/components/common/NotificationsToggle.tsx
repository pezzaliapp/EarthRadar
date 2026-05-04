import { useTranslation } from '@/i18n';
import { useNotificationsControls } from '@/hooks/useNotifications';

/**
 * Bottone unico per opt-in alle notifiche v1.0.
 *
 * Stati possibili:
 *  - unsupported: nascosto (Safari < 16, browser senza Notification API).
 *  - default + disabled: invita ad attivarle.
 *  - granted + enabled: badge "Notifiche attive".
 *  - denied: badge "Bloccate dal browser" (l'utente deve andare nelle settings).
 */
export default function NotificationsToggle() {
  const { t } = useTranslation();
  const { permission, enabled, supported, request, setEnabled } = useNotificationsControls();

  if (!supported) return null;

  if (permission === 'denied') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1 rounded-md border border-risk-mid/40 bg-risk-mid/10 px-2 py-0.5 text-[10px] text-risk-mid"
      >
        🔕 {t('notifications.permissionDenied')}
      </span>
    );
  }

  if (permission === 'granted' && enabled) {
    return (
      <button
        type="button"
        onClick={() => setEnabled(false)}
        className="btn-ghost h-7 px-2 py-0 text-[11px]"
        aria-pressed="true"
        aria-label={t('notifications.permissionGranted')}
      >
        🔔 {t('notifications.permissionGranted')}
      </button>
    );
  }

  // default oppure granted-but-toggled-off: prompt o riattivazione.
  return (
    <button
      type="button"
      onClick={async () => {
        const r = await request();
        if (r === 'granted') setEnabled(true);
      }}
      className="btn-ghost h-7 px-2 py-0 text-[11px]"
      aria-pressed="false"
    >
      🔔 {t('notifications.permissionRequest')}
    </button>
  );
}
