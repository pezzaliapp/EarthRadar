import { useId, useState } from 'react';
import { useTranslation } from '@/i18n';
import type { GlossaryEntry } from './educationData';

interface Props {
  entry: GlossaryEntry;
  /** Optional render-time matched term (used for ordering). */
  term: string;
}

/**
 * Glossary accordion item. Closed by default; expanding reveals the long-form
 * definition, an example phrased in the EarthRadar voice, and an optional
 * Wikipedia link for the curious.
 */
export default function GlossaryItem({ entry, term }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const headerId = useId();
  const panelId = useId();
  const base = `education.glossary.items.${entry.id}`;

  return (
    <li className="glass overflow-hidden">
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-space-700/30"
      >
        <span className="font-mono text-sm font-semibold uppercase tracking-wider text-space-50">
          {term}
        </span>
        <span
          aria-hidden
          className={`text-cyan-glow transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="space-y-2 border-t border-space-500/30 px-4 py-3 text-sm leading-relaxed text-space-100"
        >
          <p>{t(`${base}.definition`)}</p>
          <p className="text-space-300">
            <span className="label mr-2 text-magenta-glow">
              {t('education.glossary.exampleLabel')}
            </span>
            {t(`${base}.example`)}
          </p>
          {entry.wikipedia && (
            <a
              href={entry.wikipedia}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-block text-xs text-cyan-glow hover:underline"
            >
              {t('education.glossary.wikipediaLink')} ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}
