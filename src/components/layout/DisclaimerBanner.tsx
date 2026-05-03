import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';

export default function DisclaimerBanner() {
  const { t } = useTranslation();
  const acknowledged = useSettingsStore((s) => s.disclaimerAcknowledged);
  const acknowledge = useSettingsStore((s) => s.acknowledgeDisclaimer);
  const [showFull, setShowFull] = useState(!acknowledged);

  if (!showFull) {
    return (
      <div className="bg-space-800/40 px-4 py-1 text-center text-[11px] font-mono text-space-300 sm:px-6 lg:px-8">
        ⚠️ {t('disclaimer.short')}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-space-900/80 backdrop-blur-sm sm:items-center">
      <div className="glass-strong m-4 max-w-md p-6 shadow-glow">
        <h2 className="mb-2 text-lg font-semibold text-cyan-glow">
          {t('disclaimer.title')}
        </h2>
        <p className="mb-4 text-sm text-space-100">{t('disclaimer.body')}</p>
        <button
          className="btn-primary w-full"
          onClick={() => {
            acknowledge();
            setShowFull(false);
          }}
        >
          {t('disclaimer.accept')}
        </button>
      </div>
    </div>
  );
}
