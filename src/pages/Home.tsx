import { useTranslation } from '@/i18n';
import ViewModeToggle from '@/components/layout/ViewModeToggle';

const PLACEHOLDER_KEYS = [
  'home.highlightQuakes',
  'home.highlightSats',
  'home.highlightAircraft',
  'home.highlightWeather',
  'home.highlightFires',
  'home.highlightEonet',
  'home.highlightIss',
] as const;

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <section className="glass-strong space-y-3 p-6 shadow-glow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-space-50 sm:text-3xl">
              {t('home.headline')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-space-200">{t('home.intro')}</p>
          </div>
          <div className="hidden sm:block">
            <ViewModeToggle />
          </div>
        </div>
        <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 px-4 py-3 text-xs text-cyan-glow">
          {t('home.phase0Notice')}
        </div>
        <div className="sm:hidden">
          <ViewModeToggle />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">{t('home.highlights')}</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLACEHOLDER_KEYS.map((key) => (
            <li key={key} className="glass flex items-center gap-3 p-4">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-magenta-glow/15 text-magenta-glow">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <div className="flex-1 text-sm text-space-100">{t(key)}</div>
              <span className="chip border-space-500/40 text-space-300">{t('common.comingSoon')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
