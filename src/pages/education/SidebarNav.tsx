import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { EDUCATION_SECTIONS, type EducationSection } from './educationData';

interface Props {
  /** Anchor to scroll to (without `#`). When the user clicks a tab the page jumps. */
  onJump?: (section: EducationSection) => void;
}

/**
 * Section navigation. Sticky vertical sidebar on desktop (>=lg),
 * horizontal scrollable tab strip on mobile and tablet.
 *
 * Active section is determined by hash (initial render and updates from window.hashchange).
 * IntersectionObserver-based scroll-spy was considered but the page is short and
 * the hash-driven approach is simpler, more deterministic, and friendlier to a11y.
 */
export default function SidebarNav({ onJump }: Props) {
  const { t } = useTranslation();
  const [activeHash, setActiveHash] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.hash.replace('#', ''),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => setActiveHash(window.location.hash.replace('#', ''));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function isActive(section: EducationSection) {
    if (!activeHash) return section === 'layers';
    return activeHash === section;
  }

  return (
    <>
      {/* Mobile / tablet: horizontal scroll tabs */}
      <nav
        aria-label={t('education.nav.ariaLabel')}
        className="lg:hidden -mx-4 overflow-x-auto px-4 pb-2"
      >
        <ul className="flex min-w-max gap-2">
          {EDUCATION_SECTIONS.map((section) => (
            <li key={section}>
              <a
                href={`#${section}`}
                onClick={() => onJump?.(section)}
                className={`inline-flex min-h-[40px] items-center rounded-xl border px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
                  isActive(section)
                    ? 'border-cyan-glow/70 bg-cyan-glow/15 text-cyan-glow shadow-glow'
                    : 'border-space-500/40 text-space-200 hover:border-cyan-glow/50 hover:text-cyan-glow'
                }`}
                aria-current={isActive(section) ? 'true' : undefined}
              >
                {t(`education.nav.${section}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: sticky vertical sidebar */}
      <nav
        aria-label={t('education.nav.ariaLabel')}
        className="hidden lg:block"
      >
        <div className="sticky top-24">
          <ul className="space-y-1">
            {EDUCATION_SECTIONS.map((section) => (
              <li key={section}>
                <a
                  href={`#${section}`}
                  onClick={() => onJump?.(section)}
                  className={`block rounded-xl border px-3 py-2 text-sm transition-colors ${
                    isActive(section)
                      ? 'border-cyan-glow/70 bg-cyan-glow/15 text-cyan-glow shadow-glow'
                      : 'border-transparent text-space-200 hover:border-space-500/40 hover:text-space-50'
                  }`}
                  aria-current={isActive(section) ? 'true' : undefined}
                >
                  <span className="label mr-2 text-space-400">
                    {String(EDUCATION_SECTIONS.indexOf(section) + 1).padStart(2, '0')}
                  </span>
                  {t(`education.nav.${section}`)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}
