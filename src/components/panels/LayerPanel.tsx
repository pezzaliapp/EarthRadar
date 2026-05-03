import { useTranslation } from '@/i18n';
import { useLayersStore, type LayerId } from '@/store/layersStore';
import { GIBS_BASE_LAYERS, GIBS_OVERLAY_LAYERS } from '@/services/gibsLayers';
import { BASE_LAYER_OPTIONS } from '@/components/maps/baseLayerOptions';
import { GROUP_CATALOG, type CelestrakGroup } from '@/services/celestrakGroups';

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
