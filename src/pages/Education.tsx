import { Link } from 'react-router-dom';
import { useTranslation } from '@/i18n';

export default function Education() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-space-50">{t('education.title')}</h1>
        <p className="label">{t('education.subtitle')}</p>
      </header>
      <section className="glass p-6 text-sm text-space-200">
        {t('education.comingSoon')}
      </section>
      <Link
        to="/radar-mode"
        className="glass-strong block rounded-2xl p-6 transition-shadow hover:shadow-glow-phosphor"
      >
        <div className="label text-radar-phosphor">{t('radarMode.tributeBadge')}</div>
        <div className="mt-1 text-lg font-semibold text-space-50">{t('radarMode.title')}</div>
        <p className="mt-1 text-sm text-space-200">{t('radarMode.subtitle')}</p>
      </Link>
    </div>
  );
}
