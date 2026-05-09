import { useTranslation } from '@/i18n';
import type { LayerEntry } from './educationData';

interface Props {
  entry: LayerEntry;
}

/**
 * Single educational card for one of the 9 EarthRadar data layers.
 *
 * The four sub-blocks (`what`, `where`, `howToRead`, `limits`) are pulled from
 * `education.layers.items.<id>.*` so the divulgative copy can be edited and
 * translated without touching the component.
 */
export default function LayerEducationCard({ entry }: Props) {
  const { t } = useTranslation();
  const base = `education.layers.items.${entry.id}`;
  const sourceLabel = t(`${base}.where`);

  return (
    <article
      className="glass space-y-4 p-5 sm:p-6"
      aria-labelledby={`layer-${entry.id}-title`}
    >
      <header className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {entry.icon}
        </span>
        <h3
          id={`layer-${entry.id}-title`}
          className="text-lg font-semibold text-space-50"
        >
          {t(`${base}.title`)}
        </h3>
      </header>

      <div className="space-y-3 text-sm leading-relaxed text-space-100">
        <Block label={t('education.layers.card.what')} body={t(`${base}.what`)} />
        <Block
          label={t('education.layers.card.where')}
          body={
            <>
              {sourceLabel}{' '}
              <a
                href={entry.sourceHref}
                target="_blank"
                rel="noreferrer noopener"
                className="text-cyan-glow hover:underline"
              >
                ↗
              </a>
            </>
          }
        />
        <Block label={t('education.layers.card.howToRead')} body={t(`${base}.howToRead`)} />
        <Block label={t('education.layers.card.limits')} body={t(`${base}.limits`)} />
      </div>
    </article>
  );
}

function Block({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1 text-cyan-glow">{label}</div>
      <p className="text-space-100">{body}</p>
    </div>
  );
}
