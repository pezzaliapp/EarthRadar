import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';

/**
 * Pannello dettaglio fulmini — placeholder MVP v1.0.
 *
 * In v1.0 mostriamo solo informazione contestuale sul layer climatologico
 * (cosa rappresenta, copertura, source). Il layer è una mappa di densità,
 * non singoli strike interrogabili.
 *
 * In v1.1 (WS Blitzortung) qui mostreremo il dettaglio dello strike
 * selezionato: timestamp, lat/lon, energia, type (IC/CG), distanza
 * dall'osservatore, tempo dal lampo (utile per la regola "secondi tra
 * lampo e tuono → distanza").
 */
export default function LightningDetailPanel() {
  const { t } = useTranslation();
  const enabled = useLayersStore((s) => s.overlays.lightning?.enabled ?? false);
  if (!enabled) return null;
  return (
    <aside className="glass-strong space-y-2 p-4 text-sm" aria-label={t('lightning.detailTitle')}>
      <header>
        <p className="label">{t('lightning.detailTitle')}</p>
        <h2 className="text-base font-semibold text-cyan-glow">⚡ {t('lightning.title')}</h2>
      </header>
      <p className="text-[12px] text-space-200">{t('lightning.detailIntro')}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-space-200">
        <li>{t('lightning.detailBullet1')}</li>
        <li>{t('lightning.detailBullet2')}</li>
        <li>{t('lightning.detailBullet3')}</li>
      </ul>
      <p className="text-[10px] text-space-400">{t('lightning.attribution')}.</p>
    </aside>
  );
}
