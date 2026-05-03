import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTranslation } from '@/i18n';

export default function OnlineBadge() {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  return (
    <span
      className={`chip ${online ? 'border-risk-low/40 text-risk-low' : 'border-risk-high/40 text-risk-high'}`}
      aria-live="polite"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-risk-low animate-pulse' : 'bg-risk-high'}`}
      />
      {online ? t('common.online') : t('common.offline')}
    </span>
  );
}
