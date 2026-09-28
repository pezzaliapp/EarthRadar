import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useLayersStore, type CamExplorerMode, type CamTypeFilter } from '@/store/layersStore';
import { useCamCatalog } from '@/hooks/useCamCatalog';
import VirtualList from '@/components/common/VirtualList';
import CamThumb from './CamThumb';
import { camKey, type Cam } from '@/services/camCatalog';
import { CAM_LIVE_COLOR, CAM_SOURCES, type CamSourceId } from '@/services/camSources';
import {
  buildAreas,
  camsInArea,
  countByType,
  filterByType,
  formatCount,
  formatKm,
  roundCenter,
  searchCams,
  searchTextOf,
  sortByDistance,
  type SourceRegistry,
} from '@/lib/camExplorer';

/**
 * CAM Explorer — "quali camere posso guardare".
 *
 *  MAPPA/GLOBO = dove sono · EXPLORER = quali posso guardare · CAMCARD = la camera scelta
 *
 * Filtro principale TUTTE | 🔴 LIVE | 📷 SNAP, combinato con tre modi di
 * esplorare TUTTO il catalogo (nessuna selezione arbitraria):
 *  - Aree: generate dal registro delle fonti (data-driven);
 *  - Zona mappa: intero catalogo ordinato per distanza dal centro osservato;
 *  - Cerca: ricerca locale su nome, id, area e fonte.
 *
 * Elenco virtualizzato (solo le righe visibili nel DOM), preview lazy e
 * limitate (vedi CamThumb). Desktop: nella colonna laterale; mobile: pannello
 * dal basso, chiudibile, che si chiude da solo alla scelta di una camera.
 */

const ROW_HEIGHT = 76;
const REGISTRY: SourceRegistry = CAM_SOURCES;

interface Props {
  variant: 'sidebar' | 'sheet';
}

interface Row {
  cam: Cam;
  km?: number;
}

export default function CamExplorer({ variant }: Props) {
  const { t, language } = useTranslation();
  const { cams: allCams, loading, error } = useCamCatalog(true);
  const typeFilter = useLayersStore((s) => s.camTypeFilter);
  const setTypeFilter = useLayersStore((s) => s.setCamTypeFilter);
  const typeCounts = useMemo(() => countByType(allCams), [allCams]);
  // Il filtro LIVE/SNAP si applica prima di aree, zona mappa e ricerca.
  const cams = useMemo(() => filterByType(allCams, typeFilter), [allCams, typeFilter]);
  const mode = useLayersStore((s) => s.camExplorerMode);
  const setMode = useLayersStore((s) => s.setCamExplorerMode);
  const setOpen = useLayersStore((s) => s.setCamExplorerOpen);
  const focusCam = useLayersStore((s) => s.focusCam);
  const selected = useLayersStore((s) => s.selectedCam);
  const mapCenter = useLayersStore((s) => s.mapCenter);
  const [areaKey, setAreaKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const sectionRef = useRef<HTMLElement | null>(null);

  const isSheet = variant === 'sheet';
  const close = () => setOpen(false);

  // Desktop: porta Explorer in vista all'apertura (es. dalla callout della Home).
  useEffect(() => {
    if (!isSheet) sectionRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [isSheet]);

  // Esc chiude il pannello mobile.
  useEffect(() => {
    if (!isSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSheet, setOpen]);

  const areas = useMemo(() => buildAreas(cams, REGISTRY), [cams]);
  const searchIndex = useMemo(() => cams.map((c) => searchTextOf(c, REGISTRY)), [cams]);
  // Centro arrotondato (~2 km): nessun riordino per micro-spostamenti.
  const [cLat, cLon] = roundCenter(mapCenter[0], mapCenter[1]);

  const rows = useMemo<Row[]>(() => {
    if (mode === 'near') return sortByDistance(cams, cLat, cLon);
    if (mode === 'search') return searchCams(cams, searchIndex, query).map((cam) => ({ cam }));
    if (areaKey) return camsInArea(cams, REGISTRY, areaKey).map((cam) => ({ cam }));
    return [];
  }, [mode, cams, cLat, cLon, searchIndex, query, areaKey]);

  const selectedKey = selected ? camKey(selected.source, selected.id) : null;

  const pick = (cam: Cam) => {
    focusCam({ source: cam.source, id: cam.id, lat: cam.lat, lon: cam.lon });
    if (isSheet) {
      // Mobile: chiude il pannello e riporta la mappa in vista con la CamCard.
      setOpen(false);
      document.getElementById('er-map')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }
  };

  const tabs: Array<{ id: CamExplorerMode; label: string }> = [
    { id: 'areas', label: t('cam.tabAreas') },
    { id: 'near', label: t('cam.tabNear') },
    { id: 'search', label: t('cam.tabSearch') },
  ];

  const listKey = `${typeFilter}:${mode}:${mode === 'areas' ? areaKey : ''}:${mode === 'search' ? query : ''}`;

  const typeChips: Array<{ id: CamTypeFilter; label: string; count: number }> = [
    { id: 'all', label: t('cam.filterAll'), count: typeCounts.all },
    { id: 'live', label: t('cam.filterLive'), count: typeCounts.live },
    { id: 'snap', label: t('cam.filterSnap'), count: typeCounts.snap },
  ];

  const body = (
    <>
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide text-cyan-glow">📷 {t('cam.explorerTitle')}</h2>
          <p className="label mt-0.5">
            {allCams.length > 0 ? t('cam.count', { count: formatCount(cams.length, language) }) : t('cam.loading')}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="btn-ghost h-10 min-w-10 shrink-0 px-3 py-0 text-[13px]"
          aria-label={t('cam.closeExplorer')}
        >
          ✕
        </button>
      </header>

      <div role="radiogroup" aria-label={t('cam.filterLabel')} className="mt-2 grid grid-cols-3 gap-1">
        {typeChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="radio"
            aria-checked={typeFilter === chip.id}
            onClick={() => setTypeFilter(chip.id)}
            className={`min-h-[40px] rounded-lg border px-1.5 text-[11px] font-semibold transition-colors ${
              typeFilter === chip.id
                ? chip.id === 'live'
                  ? 'border-[#ff3b3b]/70 bg-[#ff3b3b]/15 text-[#ffb3b3]'
                  : 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow'
                : 'border-space-500/40 bg-space-800/40 text-space-300 hover:bg-space-800/70'
            }`}
          >
            <span className="block leading-tight">{chip.label}</span>
            <span className="block font-mono text-[10px] font-normal opacity-80">
              {formatCount(chip.count, language)}
            </span>
          </button>
        ))}
      </div>

      <div role="tablist" aria-label={t('cam.explorerTitle')} className="mt-1.5 grid grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={`min-h-[40px] rounded-lg border px-2 text-[11px] font-mono uppercase tracking-wide transition-colors ${
              mode === tab.id
                ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow'
                : 'border-space-500/40 bg-space-800/40 text-space-300 hover:bg-space-800/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-2 min-h-0 flex-1 flex flex-col">
        {error && <p className="text-[11px] text-risk-high">{t('cam.catalogError')}</p>}
        {!error && loading && cams.length === 0 && (
          <p className="text-[11px] text-space-300">{t('cam.loading')}</p>
        )}

        {allCams.length > 0 && cams.length === 0 && (
          <p className="text-[11px] text-space-300">{t('cam.noResults')}</p>
        )}

        {mode === 'areas' && !areaKey && cams.length > 0 && (
          <ul className="space-y-1.5 overflow-y-auto overscroll-contain" aria-label={t('cam.tabAreas')}>
            {areas.map((a) => (
              <li key={a.key}>
                <button
                  type="button"
                  onClick={() => setAreaKey(a.key)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-lg border border-space-500/30 bg-space-800/40 px-3 py-2 text-left hover:border-cyan-glow/40 hover:bg-space-800/70"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-space-50">{a.label[language]}</span>
                    <span className="block truncate text-[10px] text-space-300">
                      {a.sources.map((s) => REGISTRY[s]?.label ?? s).join(' · ')}
                    </span>
                  </span>
                  <span className="font-mono text-[12px] text-cyan-glow">
                    {formatCount(a.count, language)}
                  </span>
                  <span className="text-space-300" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {mode === 'areas' && areaKey && (
          <button
            type="button"
            onClick={() => setAreaKey(null)}
            className="mb-1.5 self-start rounded-md px-1 py-1.5 text-[11px] text-cyan-glow hover:underline"
          >
            ← {t('cam.allAreas')} · {areas.find((a) => a.key === areaKey)?.label[language]}
          </button>
        )}

        {mode === 'near' && cams.length > 0 && (
          <p className="mb-1.5 text-[10px] leading-snug text-space-300">{t('cam.nearHint')}</p>
        )}

        {mode === 'search' && (
          <div className="mb-1.5">
            <input
              type="search"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('cam.searchPlaceholder')}
              aria-label={t('cam.searchPlaceholder')}
              className="w-full rounded-lg border border-space-500/40 bg-space-900/80 px-3 py-2 text-base text-space-50 placeholder:text-space-400 focus:border-cyan-glow/60 focus:outline-none sm:text-sm"
            />
            {query.trim() !== '' && (
              <p className="mt-1 text-[10px] text-space-300" role="status">
                {rows.length > 0 ? t('cam.results', { count: rows.length }) : t('cam.noResults')}
              </p>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <VirtualList
            key={listKey}
            items={rows}
            rowHeight={ROW_HEIGHT}
            getKey={(r) => camKey(r.cam.source, r.cam.id)}
            ariaLabel={t('cam.explorerTitle')}
            className="min-h-0 flex-1 rounded-lg border border-space-500/20"
            renderRow={(r, _i, root) => (
              <ExplorerRow
                row={r}
                root={root}
                selected={selectedKey === camKey(r.cam.source, r.cam.id)}
                onPick={pick}
              />
            )}
          />
        )}
      </div>
    </>
  );

  if (isSheet) {
    return (
      <>
        <div className="fixed inset-0 z-[1090] bg-space-950/60 backdrop-blur-[1px]" onClick={close} aria-hidden />
        <section
          ref={sectionRef}
          id="cam-explorer"
          role="dialog"
          aria-modal="true"
          aria-label={t('cam.explorerTitle')}
          className="glass-strong safe-bottom fixed inset-x-0 bottom-0 z-[1100] flex h-[82vh] max-h-[82dvh] flex-col rounded-b-none rounded-t-2xl p-3 shadow-glow"
        >
          {body}
        </section>
      </>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="cam-explorer"
      aria-label={t('cam.explorerTitle')}
      className="glass flex h-[min(72vh,640px)] flex-col p-3"
    >
      {body}
    </section>
  );
}

interface RowProps {
  row: Row;
  root: HTMLDivElement | null;
  selected: boolean;
  onPick: (cam: Cam) => void;
}

function ExplorerRow({ row, root, selected, onPick }: RowProps) {
  const { t, language } = useTranslation();
  const { cam, km } = row;
  const source = CAM_SOURCES[cam.source as CamSourceId];
  return (
    <button
      type="button"
      onClick={() => onPick(cam)}
      aria-current={selected ? 'true' : undefined}
      className={`flex h-full w-full items-center gap-2.5 border-b border-space-500/20 px-2 text-left transition-colors ${
        selected ? 'bg-magenta-glow/10' : 'hover:bg-space-800/60'
      }`}
    >
      <div className="h-[54px] w-24 shrink-0">
        <CamThumb source={cam.source} id={cam.id} poster={cam.poster} root={root} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[12px] leading-tight text-space-50">{cam.name}</p>
        <p className="mt-0.5 truncate text-[10px] text-space-300">
          {source ? `${source.region[language]} · ${source.label}` : cam.source}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-space-300">
          {cam.type === 'live' ? (
            <span
              className="inline-flex items-center gap-1 rounded border px-1 font-mono text-[9px] tracking-wider"
              style={{ borderColor: `${CAM_LIVE_COLOR}99`, color: '#ffb3b3' }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: CAM_LIVE_COLOR }} />
              {t('cam.rowLive')}
            </span>
          ) : (
            <span className="rounded border border-cyan-glow/50 px-1 font-mono text-[9px] tracking-wider text-cyan-glow">
              {t('cam.snap')}
            </span>
          )}
          {source && <span className="font-mono">{source.updateEvery[language]}</span>}
          {km !== undefined && <span className="ml-auto font-mono text-space-200">{formatKm(km, language)}</span>}
        </p>
      </div>
    </button>
  );
}
