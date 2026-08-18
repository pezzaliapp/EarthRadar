import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n';
import { type ReactNode } from 'react';

const items: { path: string; key: string; icon: ReactNode }[] = [
  {
    path: '/',
    key: 'nav.home',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
  {
    path: '/anomaly',
    key: 'nav.anomaly',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12h3l2-7 4 14 3-9 2 4h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    path: '/education',
    key: 'nav.education',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7l9-4 9 4-9 4-9-4Z" />
        <path d="M21 10v6" />
        <path d="M5 9v5a7 7 0 0 0 14 0V9" />
      </svg>
    ),
  },
  {
    path: '/radar-mode',
    key: 'nav.radar',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <path d="M12 12L20 6" />
      </svg>
    ),
  },
  {
    path: '/about',
    key: 'nav.about',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v5h1" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-space-500/30 bg-space-900/85 backdrop-blur-md md:hidden"
      aria-label="Primary mobile"
      data-testid="bottom-nav"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-5">
        {items.map((it) => (
          <NavLink
            key={it.path}
            to={it.path}
            end={it.path === '/'}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 text-[9px] font-mono uppercase tracking-wide ${
                isActive ? 'text-cyan-glow' : 'text-space-300'
              }`
            }
          >
            {it.icon}
            <span className="w-full truncate text-center leading-none">{t(it.key)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
