import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { DataSourceEntry } from './educationData';

interface Props {
  entry: DataSourceEntry;
}

/**
 * One row in the "Sorgenti dati" / "Data sources" section.
 *
 * Citation field is collapsed by default (academics will expand on demand,
 * casual readers don't need to see a BibTeX-shaped string upfront).
 */
export default function DataSourceCard({ entry }: Props) {
  const { t } = useTranslation();
  const base = `education.sources.items.${entry.id}`;
  const [showCitation, setShowCitation] = useState(false);

  return (
    <article
      className="glass flex flex-col gap-3 p-5 sm:p-6"
      aria-labelledby={`src-${entry.id}-title`}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-cyan-glow/10 font-mono text-sm text-cyan-glow"
        >
          {t(`${base}.glyph`)}
        </span>
        <div className="flex-1">
          <h3
            id={`src-${entry.id}-title`}
            className="text-base font-semibold text-space-50"
          >
            {t(`${base}.name`)}
          </h3>
          <a
            href={entry.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-xs text-cyan-glow hover:underline"
          >
            {entry.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
          </a>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-space-100">{t(`${base}.provides`)}</p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="label text-space-300">{t('education.sources.card.license')}</dt>
        <dd className="text-space-100">{t(`${base}.license`)}</dd>
        <dt className="label text-space-300">{t('education.sources.card.frequency')}</dt>
        <dd className="text-space-100">{t(`${base}.frequency`)}</dd>
      </dl>

      <div>
        <button
          type="button"
          onClick={() => setShowCitation((v) => !v)}
          aria-expanded={showCitation}
          className="text-xs text-magenta-glow hover:underline"
        >
          {showCitation
            ? t('education.sources.card.citationHide')
            : t('education.sources.card.citationShow')}
        </button>
        {showCitation && (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-space-500/40 bg-space-900/60 p-3 font-mono text-[11px] leading-relaxed text-space-100">
            {t(`${base}.citation`)}
          </pre>
        )}
      </div>
    </article>
  );
}
