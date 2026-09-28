import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { useCamCatalog } from '@/hooks/useCamCatalog';
import { useLayersStore } from '@/store/layersStore';
import SourceBadge from '@/components/common/SourceBadge';
import { formatCount } from '@/lib/camExplorer';
import { CAM_SOURCES, CAM_SOURCE_IDS, isAllowedCamUrl } from '@/services/camSources';

/**
 * Dettaglio della riga CAM nel LayerPanel (chunk lazy, montato solo con CAM ON):
 * stato del catalogo, accesso a CAM Explorer, natura SNAP delle immagini e
 * fonti con licenza e attribuzione complete (sezione chiusa di default).
 */
export default function CamSourcesInfo() {
  const { t, language } = useTranslation();
  const catalog = useCamCatalog(true);
  const explorerOpen = useLayersStore((s) => s.camExplorerOpen);
  const setExplorerOpen = useLayersStore((s) => s.setCamExplorerOpen);
  const [showSources, setShowSources] = useState(false);
  const counts = new Map<string, number>();
  for (const c of catalog.cams) counts.set(c.source, (counts.get(c.source) ?? 0) + 1);

  return (
    <div className="mt-2 space-y-1.5 pl-6">
      <SourceBadge
        sourceLabel="CAM"
        source={catalog.source}
        loading={catalog.loading}
        error={catalog.error}
        fetchedAt={catalog.fetchedAt}
        language={language}
      />
      {catalog.error && <p className="text-[10px] text-risk-high">{t('cam.catalogError')}</p>}
      {catalog.cams.length > 0 && (
        <p className="font-mono text-[10px] text-space-200">
          {t('cam.count', { count: formatCount(catalog.cams.length, language) })}
        </p>
      )}
      {!explorerOpen && (
        <button
          type="button"
          onClick={() => setExplorerOpen(true)}
          className="btn-primary min-h-[40px] w-full justify-center text-[12px]"
        >
          📷 {t('cam.openExplorer')}
        </button>
      )}
      <p className="rounded-md border border-cyan-glow/30 bg-cyan-glow/5 px-2 py-1 text-[11px] leading-snug text-cyan-glow">
        <span className="font-mono">SNAP</span> · {t('cam.previewNote')}
      </p>
      <button
        type="button"
        onClick={() => setShowSources((v) => !v)}
        aria-expanded={showSources}
        aria-controls="cam-sources-list"
        className="flex min-h-[32px] w-full items-center gap-1 text-left text-[11px] text-space-200 hover:text-cyan-glow"
      >
        <span className="flex-1">{t('cam.attributionToggle')}</span>
        <span aria-hidden className={`transition-transform ${showSources ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {showSources && (
        <ul id="cam-sources-list" className="space-y-1.5">
          {CAM_SOURCE_IDS.map((id) => {
            const s = CAM_SOURCES[id];
            return (
              <li key={id} className="text-[10px] leading-snug text-space-300">
                <span className="text-space-100">{s.label}</span> — {s.region[language]}
                {counts.has(id) && <span className="font-mono"> · {formatCount(counts.get(id) ?? 0, language)}</span>}
                <ul className="mt-0.5 font-mono text-[9.5px]">
                  {s.attribution.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {isAllowedCamUrl(s.licenseUrl) && (
                  <a
                    href={s.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="text-cyan-glow underline decoration-cyan-glow/40 underline-offset-2"
                  >
                    {s.licenseName} ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
