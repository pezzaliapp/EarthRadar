import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/i18n';

export default function ViewModeToggle() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const setViewMode = useSettingsStore((s) => s.setViewMode);
  const { t } = useTranslation();

  return (
    <div
      className="inline-flex items-center rounded-lg border border-space-500/40 bg-space-800/60 p-0.5 text-[11px] font-mono uppercase tracking-wider"
      role="radiogroup"
      aria-label="View mode"
    >
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === '2d'}
        onClick={() => setViewMode('2d')}
        className={`rounded-md px-2 py-1 transition-colors ${
          viewMode === '2d' ? 'bg-cyan-glow/15 text-cyan-glow' : 'text-space-300'
        }`}
      >
        {t('common.view2d')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === '3d'}
        onClick={() => setViewMode('3d')}
        className={`rounded-md px-2 py-1 transition-colors ${
          viewMode === '3d' ? 'bg-magenta-glow/15 text-magenta-glow' : 'text-space-300'
        }`}
      >
        {t('common.view3d')}
      </button>
    </div>
  );
}
