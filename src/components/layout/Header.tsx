import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import OnlineBadge from './OnlineBadge';
import ViewModeToggle from './ViewModeToggle';
import NotificationsToggle from '@/components/common/NotificationsToggle';

const NAV: Array<{ to: string; key: string }> = [
  { to: '/', key: 'nav.home' },
  { to: '/education', key: 'nav.education' },
  { to: '/about', key: 'nav.about' },
];

export default function Header() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-space-500/30 bg-space-900/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-glow/15 text-cyan-glow shadow-glow transition-transform group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <ellipse cx="12" cy="12" rx="9" ry="3.5" />
              <path d="M12 3v18" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="font-semibold tracking-wide">EarthRadar</div>
            <div className="label text-space-300">{t('common.tagline')}</div>
          </div>
        </Link>

        <nav
          className="hidden items-center gap-1 text-xs font-mono uppercase tracking-wider md:flex"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-2 py-1 transition-colors ${
                  isActive
                    ? 'bg-cyan-glow/15 text-cyan-glow'
                    : 'text-space-300 hover:text-space-50'
                }`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <ViewModeToggle />
          </div>
          <div className="hidden lg:block">
            <NotificationsToggle />
          </div>
          <OnlineBadge />
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs font-mono uppercase tracking-wider"
            onClick={() => setLanguage(language === 'it' ? 'en' : 'it')}
            aria-label="Switch language"
          >
            {language === 'it' ? 'EN' : 'IT'}
          </button>
        </div>
      </div>
    </header>
  );
}
