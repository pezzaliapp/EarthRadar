import { useTranslation } from '@/i18n';
import { useLayersStore, type LayerId } from '@/store/layersStore';
import {
  GIBS_BASE_LAYERS,
  GIBS_OVERLAY_LAYERS,
  GIBS_OVERLAY_WARN_THRESHOLD,
  activeGibsOverlays,
} from '@/services/gibsLayers';
import { BASE_LAYER_OPTIONS } from '@/components/maps/baseLayerOptions';
import { GROUP_CATALOG, type CelestrakGroup } from '@/services/celestrakGroups';
import { EONET_CATEGORIES } from '@/services/eonetCategories';
import { firmsMapKey, type FirmsDayRange, type FirmsSource } from '@/services/firmsApi';

const GROUP_LABEL_KEY: Record<CelestrakGroup, string> = {
  stations: 'satellites.groupStations',
  visual: 'satellites.groupVisual',
  starlink: 'satellites.groupStarlink',
  'gps-ops': 'satellites.groupGps',
  galileo: 'satellites.groupGalileo',
  'glo-ops': 'satellites.groupGlonass',
  science: 'satellites.groupScience',
  weather: 'satellites.groupWeather',
};

interface Props {
  /** Mostrato come pannello laterale dentro un parent grid (desktop). */
  className?: string;
}

export default function LayerPanel({ className = '' }: Props) {
  const { t, language } = useTranslation();
  const baseLayer = useLayersStore((s) => s.baseLayer);
  const overlays = useLayersStore((s) => s.overlays);
  const setBaseLayer = useLayersStore((s) => s.setBaseLayer);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);

  return (
    <aside className={`glass space-y-4 p-4 ${className}`} aria-label={t('layers.title')}>
      <header>
        <h2 className="text-sm font-semibold tracking-wide text-cyan-glow">{t('layers.title')}</h2>
        <p className="label mt-0.5">{t('layers.subtitle')}</p>
      </header>

      {/* BASE LAYER (radio) */}
      <fieldset className="space-y-2">
        <legend className="label">{t('layers.baseLayer')}</legend>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
          {BASE_LAYER_OPTIONS.map((opt) => {
            const selected = baseLayer === opt.id;
            return (
              <button
                key={opt.id}
                role="radio"
                aria-checked={selected}
                type="button"
                onClick={() => setBaseLayer(opt.id)}
                className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-mono uppercase tracking-wide transition-colors ${
                  selected
                    ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow'
                    : 'border-space-500/40 bg-space-800/40 text-space-300 hover:bg-space-800/70'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            );
          })}
        </div>
        {/* Opacity per il base layer GIBS (escluso OSM) */}
        {baseLayer !== 'osm' && (
          <OpacitySlider
            id={baseLayer}
            value={overlays[baseLayer]?.opacity ?? 1}
            onChange={(v) => setOpacity(baseLayer, v)}
            label={t('layers.opacity')}
          />
        )}
      </fieldset>

      {/* DATA LAYERS */}
      <fieldset className="space-y-2">
        <legend className="label">{t('layers.dataLayers')}</legend>
        <ToggleRow
          id="quakes"
          label={`🌍 ${t('layers.quakes')}`}
          enabled={overlays.quakes?.enabled ?? false}
          opacity={overlays.quakes?.opacity ?? 1}
          onToggle={(v) => setOverlayEnabled('quakes', v)}
          onOpacity={(v) => setOpacity('quakes', v)}
        />
        <SatellitesRow />
        <IssRow />
        <AircraftRow />
        <WeatherRow />
        <RainRadarRow />
        <EonetRow />
        <FiresRow />
        <LightningRow />
        <ToggleRow
          id="terminator"
          label={`🌑 ${t('layers.terminator')}`}
          enabled={overlays.terminator?.enabled ?? false}
          opacity={overlays.terminator?.opacity ?? 0.6}
          onToggle={(v) => setOverlayEnabled('terminator', v)}
          onOpacity={(v) => setOpacity('terminator', v)}
        />
      </fieldset>

      {/* GIBS OVERLAYS */}
      <fieldset className="space-y-2">
        <legend className="label">{t('layers.gibsOverlays')}</legend>
        <GibsOverlaysWarning />
        <ul className="space-y-2">
          {GIBS_OVERLAY_LAYERS.map((layer) => {
            const id = layer.id as LayerId;
            return (
              <li key={layer.id}>
                <ToggleRow
                  id={id}
                  label={layer.name[language]}
                  description={layer.description[language]}
                  enabled={overlays[id]?.enabled ?? false}
                  opacity={overlays[id]?.opacity ?? 0.6}
                  onToggle={(v) => setOverlayEnabled(id, v)}
                  onOpacity={(v) => setOpacity(id, v)}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>

      {/* Sources note (chiarificazione: fonte sempre visibile) */}
      <footer className="border-t border-space-500/30 pt-3">
        <p className="label mb-1 text-space-300">{t('common.source')}</p>
        <p className="text-[11px] leading-relaxed text-space-300">
          {GIBS_BASE_LAYERS.length} base · {GIBS_OVERLAY_LAYERS.length} overlay · NASA GIBS · USGS · OSM
        </p>
      </footer>
    </aside>
  );
}

/**
 * Riga "Satelliti" con sotto-toggles per i gruppi CelesTrak.
 * Si espande quando il layer è attivo.
 */
function SatellitesRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const groups = useLayersStore((s) => s.satelliteGroups);
  const toggleGroup = useLayersStore((s) => s.toggleSatelliteGroup);
  const enabled = overlays.satellites?.enabled ?? false;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('satellites', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🛰️ {t('satellites.title')}</span>
      </label>
      {enabled && (
        <div className="mt-2 space-y-1.5 pl-6">
          <p className="label text-space-300">{t('satellites.groups')}</p>
          <div className="grid grid-cols-1 gap-1">
            {GROUP_CATALOG.map((spec) => {
              const id = spec.id;
              const active = groups.includes(id);
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${
                    active
                      ? 'border-cyan-glow/40 bg-cyan-glow/5 text-cyan-glow'
                      : 'border-space-500/30 bg-space-800/40 text-space-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleGroup(id)}
                    className="h-3.5 w-3.5 accent-cyan-glow"
                  />
                  <span>{t(GROUP_LABEL_KEY[id])}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Riga "Aerei" con sotto-toggles per a-terra e vettori velocità.
 */
function AircraftRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const showOnGround = useLayersStore((s) => s.aircraftShowOnGround);
  const showVectors = useLayersStore((s) => s.aircraftShowVelocityVectors);
  const setShowOnGround = useLayersStore((s) => s.setAircraftShowOnGround);
  const setShowVectors = useLayersStore((s) => s.setAircraftShowVelocityVectors);
  const enabled = overlays.aircraft?.enabled ?? false;
  const opacity = overlays.aircraft?.opacity ?? 1;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('aircraft', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">✈️ {t('aircraft.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('aircraft', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="Aircraft opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-1.5 pl-6">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-space-200">
            <input
              type="checkbox"
              checked={showOnGround}
              onChange={(e) => setShowOnGround(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-glow"
            />
            <span>{t('aircraft.showOnGround')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-space-200">
            <input
              type="checkbox"
              checked={showVectors}
              onChange={(e) => setShowVectors(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-glow"
            />
            <span>{t('aircraft.showVectors')}</span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Riga "Meteo Open-Meteo" con slider distanza celle (20..500 km). */
function WeatherRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const stepKm = useLayersStore((s) => s.weatherGridStepKm);
  const setStepKm = useLayersStore((s) => s.setWeatherGridStepKm);
  const enabled = overlays.weather?.enabled ?? false;
  const opacity = overlays.weather?.opacity ?? 1;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('weather', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🌦️ {t('weather.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('weather', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="Weather opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-1.5 pl-6">
          <label className="flex items-center gap-2 text-[11px] text-space-200">
            <span className="flex-shrink-0">{t('weather.stepKm')}</span>
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={stepKm}
              onChange={(e) => setStepKm(Number(e.target.value))}
              className="flex-1 accent-cyan-glow"
              aria-label="Grid step km"
            />
            <span className="w-12 text-right font-mono text-[10px] text-space-300">{stepKm} km</span>
          </label>
          <p className="text-[10px] text-space-300">{t('weather.attribution')}.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Riga EONET: toggle layer + filtri (categorie, range giorni, status).
 * Le 13 categorie statiche sono già localizzate via `eonet.cat.<id>`.
 */
function EonetRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const cats = useLayersStore((s) => s.eonetActiveCategories);
  const toggleCat = useLayersStore((s) => s.toggleEonetCategory);
  const days = useLayersStore((s) => s.eonetDaysRange);
  const setDays = useLayersStore((s) => s.setEonetDaysRange);
  const status = useLayersStore((s) => s.eonetStatus);
  const setStatus = useLayersStore((s) => s.setEonetStatus);
  const enabled = overlays.eonet?.enabled ?? false;
  const opacity = overlays.eonet?.opacity ?? 1;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('eonet', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🌪️ {t('eonet.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('eonet', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="EONET opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-2 pl-6">
          <label className="flex items-center gap-2 text-[11px] text-space-200">
            <span className="flex-shrink-0">{t('eonet.daysRange')}</span>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="flex-1 accent-cyan-glow"
              aria-label="EONET days range"
            />
            <span className="w-12 text-right font-mono text-[10px] text-space-300">{days} d</span>
          </label>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="label flex-shrink-0">{t('eonet.statusLabel')}</span>
            <button
              type="button"
              onClick={() => setStatus('open')}
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                status === 'open'
                  ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow'
                  : 'border-space-500/40 bg-space-800/40 text-space-300'
              }`}
              aria-pressed={status === 'open'}
            >
              {t('eonet.statusOpen')}
            </button>
            <button
              type="button"
              onClick={() => setStatus('all')}
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                status === 'all'
                  ? 'border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow'
                  : 'border-space-500/40 bg-space-800/40 text-space-300'
              }`}
              aria-pressed={status === 'all'}
            >
              {t('eonet.statusAll')}
            </button>
          </div>

          <div>
            <p className="label mb-1">
              {t('eonet.categoriesLabel')}{' '}
              {cats.length === 0 && (
                <span className="ml-1 text-[10px] text-cyan-glow">· {t('eonet.categoriesAll')}</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {EONET_CATEGORIES.map((spec) => {
                const active = cats.includes(spec.id);
                return (
                  <label
                    key={spec.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'border-cyan-glow/40 bg-cyan-glow/5 text-cyan-glow'
                        : 'border-space-500/30 bg-space-800/40 text-space-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleCat(spec.id)}
                      className="h-3 w-3 accent-cyan-glow"
                    />
                    <span aria-hidden>{spec.emoji}</span>
                    <span className="truncate">{t(spec.i18nKey)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-space-300">{t('eonet.attribution')}.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Riga "Incendi attivi" — FIRMS NRT con fallback automatico GIBS.
 *
 * - Se VITE_FIRMS_MAP_KEY è configurata: badge FIRMS, selettore source,
 *   slider day range 1..7.
 * - Se manca: badge giallo "GIBS · MODIS Fires (fallback)" + CTA per
 *   ottenere una map key gratuita. I controlli di FIRMS restano nascosti
 *   perché in questo caso l'overlay GIBS è giornaliero e non parametrizzabile.
 */
function FiresRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const source = useLayersStore((s) => s.firesSource);
  const setSource = useLayersStore((s) => s.setFiresSource);
  const dayRange = useLayersStore((s) => s.firesDayRange);
  const setDayRange = useLayersStore((s) => s.setFiresDayRange);
  const enabled = overlays.firms?.enabled ?? false;
  const opacity = overlays.firms?.opacity ?? 1;
  const hasKey = firmsMapKey() !== null;
  const sources: FirmsSource[] = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'];
  const sourceLabel = (id: FirmsSource): string => {
    if (id === 'VIIRS_SNPP_NRT') return t('fires.sourceVIIRS_SNPP');
    if (id === 'VIIRS_NOAA20_NRT') return t('fires.sourceVIIRS_NOAA20');
    return t('fires.sourceMODIS');
  };
  const isModis = source === 'MODIS_NRT';
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('firms', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🔥 {t('fires.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('firms', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="Fires opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-2 pl-6">
          {/* Badge dinamico */}
          <p
            className={`inline-block rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
              hasKey
                ? 'border-risk-low/40 bg-risk-low/10 text-risk-low'
                : 'border-risk-mid/40 bg-risk-mid/10 text-risk-mid'
            }`}
          >
            {hasKey
              ? isModis
                ? t('fires.badgeFirmsModis')
                : t('fires.badgeFirms')
              : t('fires.badgeGibsFallback')}
          </p>

          {hasKey && (
            <>
              <label className="block text-[11px] text-space-200">
                <span className="label">{t('fires.sourceLabel')}</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as FirmsSource)}
                  className="mt-1 w-full rounded-md border border-space-500/40 bg-space-800/60 px-2 py-1 font-mono text-[11px] text-space-50"
                >
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {sourceLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-space-200">
                <span className="flex-shrink-0">{t('fires.dayRangeLabel')}</span>
                <input
                  type="range"
                  min={1}
                  max={7}
                  step={1}
                  value={dayRange}
                  onChange={(e) => setDayRange(Number(e.target.value) as FirmsDayRange)}
                  className="flex-1 accent-cyan-glow"
                  aria-label="FIRMS day range"
                />
                <span className="w-10 text-right font-mono text-[10px] text-space-300">
                  {dayRange} d
                </span>
              </label>
            </>
          )}

          {!hasKey && (
            <div className="space-y-1 rounded-md border border-risk-mid/40 bg-risk-mid/5 p-2 text-[11px]">
              <p className="font-semibold text-risk-mid">{t('fires.missingKeyTitle')}</p>
              <p className="text-space-200">{t('fires.missingKeyBody')}</p>
              <a
                className="inline-block underline decoration-dotted text-cyan-glow"
                href="https://firms.modaps.eosdis.nasa.gov/api/area/"
                target="_blank"
                rel="noreferrer"
              >
                {t('fires.missingKeyCta')} ↗
              </a>
            </div>
          )}

          <p className="text-[10px] text-space-300">{t('fires.attribution')}.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Riga "Fulmini" — MVP statico v1.0.
 *
 * Decisione architetturale: lightning vive come *data layer* dedicato (non
 * come overlay GIBS generico), perché in v1.1 il componente si dovrà
 * occupare anche degli strike live via WS Blitzortung — quindi UN
 * componente, non un tile-only via GibsOverlayHost.
 *
 * Banner inline tradotto IT/EN per chiarire all'utente la natura statica
 * del prodotto in questa release.
 */
function LightningRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const enabled = overlays.lightning?.enabled ?? false;
  const opacity = overlays.lightning?.opacity ?? 0.7;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('lightning', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">⚡ {t('lightning.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('lightning', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="Lightning opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-1.5 pl-6">
          <p className="rounded-md border border-cyan-glow/30 bg-cyan-glow/5 px-2 py-1 text-[11px] leading-snug text-cyan-glow">
            ⚡ {t('lightning.mvpBanner')}
          </p>
          <p className="text-[10px] text-space-300">{t('lightning.attribution')}.</p>
        </div>
      )}
    </div>
  );
}

/** Riga ISS dedicata: layer separato dal cluster satelliti, con extra ground track. */
function IssRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const setOpacity = useLayersStore((s) => s.setOpacity);
  const showTrack = useLayersStore((s) => s.issShowGroundTrack);
  const setShowTrack = useLayersStore((s) => s.setIssShowGroundTrack);
  const enabled = overlays.iss?.enabled ?? false;
  const opacity = overlays.iss?.opacity ?? 1;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('iss', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🛰️ {t('iss.title')}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => setOpacity('iss', Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label="ISS opacity"
      />
      {enabled && (
        <div className="mt-2 space-y-1.5 pl-6">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-space-200">
            <input
              type="checkbox"
              checked={showTrack}
              onChange={(e) => setShowTrack(e.target.checked)}
              className="h-3.5 w-3.5 accent-cyan-glow"
            />
            <span>{t('iss.showGroundTrack')}</span>
          </label>
          <p className="text-[10px] text-space-300">{t('iss.attribution')}.</p>
        </div>
      )}
    </div>
  );
}

/** Riga "Radar precipitazioni" — i controlli timeline vivono sopra la mappa. */
function RainRadarRow() {
  const { t } = useTranslation();
  const overlays = useLayersStore((s) => s.overlays);
  const setOverlayEnabled = useLayersStore((s) => s.setOverlayEnabled);
  const enabled = overlays.rainviewer?.enabled ?? false;
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setOverlayEnabled('rainviewer', e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
        />
        <span className="flex-1 text-[12px] text-space-50">🌧️ {t('radar.title')}</span>
      </label>
      {enabled && (
        <p className="mt-1 pl-6 text-[10px] text-space-300">
          {t('radar.subtitle')} · {t('radar.attribution')}
        </p>
      )}
    </div>
  );
}

interface ToggleRowProps {
  id: LayerId;
  label: string;
  description?: string;
  enabled: boolean;
  opacity: number;
  onToggle: (v: boolean) => void;
  onOpacity: (v: number) => void;
}

function ToggleRow({ id, label, description, enabled, opacity, onToggle, onOpacity }: ToggleRowProps) {
  return (
    <div className="rounded-lg border border-space-500/30 bg-space-800/40 p-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-cyan-glow"
          aria-controls={`${id}-opacity`}
        />
        <span className="flex-1 text-[12px] text-space-50">{label}</span>
        <span className="text-[10px] font-mono text-space-300">{Math.round(opacity * 100)}%</span>
      </label>
      {description && (
        <p className="mt-1 pl-6 text-[10px] leading-snug text-space-300">{description}</p>
      )}
      <input
        id={`${id}-opacity`}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => onOpacity(Number(e.target.value))}
        className="mt-2 w-full accent-magenta-glow disabled:opacity-40"
        disabled={!enabled}
        aria-label={`${label} opacity`}
      />
    </div>
  );
}

interface OpacityProps {
  id: LayerId;
  value: number;
  onChange: (v: number) => void;
  label: string;
}

/**
 * Warning inline sopra la sezione overlay GIBS: comparso quando l'utente ha
 * attivato ≥ GIBS_OVERLAY_WARN_THRESHOLD overlay simultanei. Non si dismette:
 * sparisce automaticamente quando si scende sotto soglia.
 */
function GibsOverlaysWarning() {
  const overlays = useLayersStore((s) => s.overlays);
  const { t } = useTranslation();
  const active = activeGibsOverlays(overlays);
  if (active.length < GIBS_OVERLAY_WARN_THRESHOLD) return null;
  return (
    <div className="rounded-md border border-risk-mid/40 bg-risk-mid/10 px-2 py-1.5 text-[11px] text-risk-mid">
      ⚠ {t('layers.gibsOverlaysWarning', { count: active.length })}
    </div>
  );
}

function OpacitySlider({ id, value, onChange, label }: OpacityProps) {
  return (
    <label className="flex items-center gap-2 pt-1">
      <span className="label flex-shrink-0">{label}</span>
      <input
        id={`${id}-base-opacity`}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-cyan-glow"
      />
      <span className="w-10 text-right text-[10px] font-mono text-space-300">
        {Math.round(value * 100)}%
      </span>
    </label>
  );
}
