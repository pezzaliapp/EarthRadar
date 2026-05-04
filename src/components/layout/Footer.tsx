import { Link } from 'react-router-dom';
import { useTranslation } from '@/i18n';
import { meteorWatchHomeLink, cubeSatHomeLink } from '@/lib/deepLinkBuilder';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-space-500/30 bg-space-900/60 px-4 py-6 text-sm text-space-300 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="font-semibold text-space-50">PezzaliAPP — EarthRadar</div>
          <div className="text-xs text-space-300">{t('footer.disclaimer')}</div>
        </div>
        <div className="flex flex-col gap-2 text-xs md:items-end">
          <div className="label text-space-300">{t('footer.sisterApps')}</div>
          <div className="flex flex-wrap gap-3">
            <a className="hover:text-cyan-glow" href={meteorWatchHomeLink()} target="_blank" rel="noreferrer">
              MeteorWatch ↗
            </a>
            <a className="hover:text-cyan-glow" href={cubeSatHomeLink()} target="_blank" rel="noreferrer">
              CubeSat Constellation ↗
            </a>
            <a
              className="hover:text-cyan-glow"
              href="https://www.pezzaliapp.com"
              target="_blank"
              rel="noreferrer"
            >
              pezzaliapp.com ↗
            </a>
            <a
              className="hover:text-cyan-glow"
              href="https://github.com/pezzaliapp/EarthRadar"
              target="_blank"
              rel="noreferrer"
            >
              {t('footer.github')} ↗
            </a>
            <Link to="/radar-mode" className="hover:text-radar-phosphor">
              {t('nav.radar')}
            </Link>
            <Link to="/about" className="hover:text-cyan-glow">
              {t('footer.about')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
