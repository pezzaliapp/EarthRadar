import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/i18n';
import SidebarNav from './education/SidebarNav';
import LayerEducationCard from './education/LayerEducationCard';
import GlossaryItem from './education/GlossaryItem';
import TutorialCard from './education/TutorialCard';
import DataSourceCard from './education/DataSourceCard';
import {
  DATA_SOURCES,
  GLOSSARY,
  LAYERS,
  TUTORIALS,
  type EducationSection,
} from './education/educationData';

/**
 * /education — divulgative hub of EarthRadar.
 *
 * Five hash-anchored sections in a single scrollable page:
 *   #layers     — one card per data layer
 *   #glossary   — accordion of ~25 terms with search
 *   #tutorials  — 4 step-by-step mini-guides
 *   #sources    — providers, licenses, citations
 *   #extra      — Radar Mode tribute
 *
 * The page is lazy-loaded as its own chunk via App.tsx (already wired).
 */
export default function Education() {
  const { t } = useTranslation();
  const [glossaryQuery, setGlossaryQuery] = useState('');

  // Smooth-scroll on initial load if the URL already carries a hash, since
  // the lazy chunk arrives after the browser's default scroll-to-anchor pass.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const glossaryItems = useMemo(() => {
    const lower = glossaryQuery.trim().toLowerCase();
    const items = GLOSSARY.map((entry) => ({
      entry,
      term: t(`education.glossary.items.${entry.id}.term`),
    })).sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    if (!lower) return items;
    return items.filter(({ entry, term }) => {
      const definition = t(`education.glossary.items.${entry.id}.definition`).toLowerCase();
      return term.toLowerCase().includes(lower) || definition.includes(lower);
    });
  }, [glossaryQuery, t]);

  function handleJump(_section: EducationSection) {
    // Default anchor behavior is fine; we keep the hook for future scroll-spy.
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-space-50">{t('education.title')}</h1>
        <p className="label">{t('education.subtitle')}</p>
        <p className="max-w-3xl pt-2 text-sm leading-relaxed text-space-200">
          {t('education.intro')}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <SidebarNav onJump={handleJump} />

        <div className="min-w-0 space-y-12">
          {/* ============================ SECTION 1 — LAYERS ============================ */}
          <section
            id="layers"
            aria-labelledby="education-layers-title"
            className="scroll-mt-24 space-y-4"
          >
            <header className="space-y-1">
              <h2
                id="education-layers-title"
                className="text-xl font-semibold text-space-50"
              >
                {t('education.layers.sectionTitle')}
              </h2>
              <p className="text-sm text-space-200">{t('education.layers.sectionIntro')}</p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
              {LAYERS.map((layer) => (
                <LayerEducationCard key={layer.id} entry={layer} />
              ))}
            </div>
          </section>

          {/* ============================ SECTION 2 — GLOSSARY ============================ */}
          <section
            id="glossary"
            aria-labelledby="education-glossary-title"
            className="scroll-mt-24 space-y-4"
          >
            <header className="space-y-1">
              <h2
                id="education-glossary-title"
                className="text-xl font-semibold text-space-50"
              >
                {t('education.glossary.sectionTitle')}
              </h2>
              <p className="text-sm text-space-200">{t('education.glossary.sectionIntro')}</p>
            </header>

            <label className="block">
              <span className="sr-only">{t('education.search.placeholder')}</span>
              <input
                type="search"
                value={glossaryQuery}
                onChange={(e) => setGlossaryQuery(e.target.value)}
                placeholder={t('education.search.placeholder')}
                className="w-full rounded-xl border border-space-500/40 bg-space-900/60 px-4 py-3 text-sm text-space-50 placeholder:text-space-400 focus:border-cyan-glow/60 focus:outline-none focus:ring-1 focus:ring-cyan-glow/40"
                aria-label={t('education.search.placeholder')}
              />
            </label>

            {glossaryItems.length === 0 ? (
              <p className="glass p-4 text-sm text-space-200">
                {t('education.search.noResults', { query: glossaryQuery })}
              </p>
            ) : (
              <ul className="space-y-2">
                {glossaryItems.map(({ entry, term }) => (
                  <GlossaryItem key={entry.id} entry={entry} term={term} />
                ))}
              </ul>
            )}
          </section>

          {/* ============================ SECTION 3 — TUTORIALS ============================ */}
          <section
            id="tutorials"
            aria-labelledby="education-tutorials-title"
            className="scroll-mt-24 space-y-4"
          >
            <header className="space-y-1">
              <h2
                id="education-tutorials-title"
                className="text-xl font-semibold text-space-50"
              >
                {t('education.tutorials.sectionTitle')}
              </h2>
              <p className="text-sm text-space-200">{t('education.tutorials.sectionIntro')}</p>
            </header>
            <div className="grid gap-4">
              {TUTORIALS.map((tutorial) => (
                <TutorialCard key={tutorial.id} entry={tutorial} />
              ))}
            </div>
          </section>

          {/* ============================ SECTION 4 — DATA SOURCES ============================ */}
          <section
            id="sources"
            aria-labelledby="education-sources-title"
            className="scroll-mt-24 space-y-4"
          >
            <header className="space-y-1">
              <h2
                id="education-sources-title"
                className="text-xl font-semibold text-space-50"
              >
                {t('education.sources.sectionTitle')}
              </h2>
              <p className="text-sm text-space-200">{t('education.sources.sectionIntro')}</p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
              {DATA_SOURCES.map((source) => (
                <DataSourceCard key={source.id} entry={source} />
              ))}
            </div>
          </section>

          {/* ============================ SECTION 5 — EXTRA ============================ */}
          <section
            id="extra"
            aria-labelledby="education-extra-title"
            className="scroll-mt-24 space-y-4"
          >
            <header className="space-y-1">
              <h2
                id="education-extra-title"
                className="text-xl font-semibold text-space-50"
              >
                {t('education.extra.sectionTitle')}
              </h2>
              <p className="text-sm text-space-200">{t('education.extra.sectionIntro')}</p>
            </header>

            <Link
              to="/radar-mode"
              className="glass-strong block rounded-2xl p-6 transition-shadow hover:shadow-glow-phosphor"
            >
              <div className="label text-radar-phosphor">{t('radarMode.tributeBadge')}</div>
              <div className="mt-1 text-lg font-semibold text-space-50">
                {t('radarMode.title')}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-space-200">
                {t('education.extra.radarModeWhy')}
              </p>
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
