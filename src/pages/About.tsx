import { useTranslation } from '@/i18n';
import { meteorWatchHomeLink, cubeSatHomeLink } from '@/lib/deepLinkBuilder';

export default function About() {
  const { t } = useTranslation();
  const version = import.meta.env.VITE_APP_VERSION ?? '1.2.1';

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-space-50">{t('about.title')}</h1>
        <p className="label">
          {t('about.version')} {version}
        </p>
      </header>

      <section className="glass space-y-3 p-6 text-sm text-space-100">
        <p>{t('about.intro')}</p>
      </section>

      <section className="glass space-y-3 p-6">
        <h2 className="label text-cyan-glow">{t('about.sisterTitle')}</h2>
        <p className="text-sm text-space-100">{t('about.sisterIntro')}</p>
        <ul className="space-y-2 text-sm">
          <li>
            <a className="text-cyan-glow hover:underline" href={meteorWatchHomeLink()} target="_blank" rel="noreferrer">
              MeteorWatch ↗
            </a>
            <span className="text-space-300"> — {t('common.comingSoon')}: deep link evento (NEO, fireball, rientri).</span>
          </li>
          <li>
            <a className="text-cyan-glow hover:underline" href={cubeSatHomeLink()} target="_blank" rel="noreferrer">
              CubeSat Constellation ↗
            </a>
            <span className="text-space-300"> — globo 3D dei satelliti, riceve TLE da EarthRadar.</span>
          </li>
        </ul>
      </section>

      <section className="glass space-y-2 p-6 text-sm">
        <h2 className="label text-magenta-glow">{t('about.sourcesTitle')}</h2>
        <p className="font-mono text-xs leading-relaxed text-space-200">{t('about.sources')}</p>
      </section>
    </div>
  );
}
