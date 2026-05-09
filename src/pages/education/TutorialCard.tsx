import { useState } from 'react';
import { useTranslation } from '@/i18n';
import type { TutorialEntry } from './educationData';

interface Props {
  entry: TutorialEntry;
}

const BASE_PATH = import.meta.env.BASE_URL ?? '/';

/**
 * Tutorial card with numeric stepper. Shows one step at a time on mobile,
 * a vertical timeline on desktop. The screenshot column degrades gracefully
 * to a placeholder block when the image is missing — the asset can be added
 * later without breaking the build.
 */
export default function TutorialCard({ entry }: Props) {
  const { t } = useTranslation();
  const base = `education.tutorials.items.${entry.id}`;
  const [active, setActive] = useState(1);

  const steps = Array.from({ length: entry.stepCount }, (_, i) => i + 1);
  const screenshotUrl = `${BASE_PATH}screenshots/edu/${entry.screenshot}`;

  return (
    <article
      className="glass space-y-4 p-5 sm:p-6"
      aria-labelledby={`tut-${entry.id}-title`}
    >
      <header className="space-y-1">
        <h3
          id={`tut-${entry.id}-title`}
          className="text-lg font-semibold text-space-50"
        >
          {t(`${base}.title`)}
        </h3>
        <p className="text-sm text-space-200">{t(`${base}.description`)}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_220px] md:items-start">
        <ol className="space-y-2">
          {steps.map((n) => {
            const isActive = active === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setActive(n)}
                  aria-expanded={isActive}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    isActive
                      ? 'border-cyan-glow/70 bg-cyan-glow/10 shadow-glow'
                      : 'border-space-500/40 hover:border-cyan-glow/40'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full font-mono text-xs font-bold ${
                      isActive
                        ? 'bg-cyan-glow text-space-900'
                        : 'bg-space-700 text-space-100'
                    }`}
                  >
                    {n}
                  </span>
                  <span className="flex-1 space-y-1">
                    <span className="block font-semibold text-space-50">
                      {t(`${base}.steps.step${n}.title`)}
                    </span>
                    {isActive && (
                      <span className="block text-sm leading-relaxed text-space-100">
                        {t(`${base}.steps.step${n}.body`)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <figure className="space-y-2">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-space-500/40 bg-space-700/40">
            <img
              src={screenshotUrl}
              alt={t(`${base}.steps.step${active}.title`)}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Hide broken image, leave the placeholder block visible.
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-space-300">
              <span className="rounded-md bg-space-900/70 px-2 py-1 font-mono">
                {t('education.tutorials.screenshotPending')}
              </span>
            </div>
          </div>
          <figcaption className="text-xs text-space-300">
            {t('education.tutorials.stepLabel', { current: active, total: entry.stepCount })}
          </figcaption>
        </figure>
      </div>
    </article>
  );
}
