import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { activeGibsOverlays } from '@/services/gibsLayers';

/**
 * Chip floating in basso a sinistra che mostra le sigle degli overlay GIBS
 * correntemente attivi, es. "AIRS · MODIS Fires · AMSR2 Sea Ice — NASA GIBS".
 *
 * Visibile solo quando almeno un overlay è attivo. Il built-in attribution di
 * Leaflet vive in basso a destra: lo lasciamo per i layer di terze parti
 * (OSM, RainViewer…), questo invece è il riassunto delle fonti GIBS attive
 * che il built-in non aggrega in modo leggibile.
 */
export default function OverlaysAttributionPanel() {
  const overlays = useLayersStore((s) => s.overlays);
  const { t } = useTranslation();
  const active = activeGibsOverlays(overlays);
  if (active.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 z-[400] max-w-[60%] rounded-md border border-cyan-glow/30 bg-space-900/80 px-2 py-1 font-mono text-[10px] tracking-wide text-cyan-glow shadow-glow backdrop-blur-md"
      role="status"
      aria-label={t('layers.gibsAttribution')}
    >
      {active.map((a) => a.shortLabel).join(' · ')} —{' '}
      <span className="text-space-200">NASA GIBS</span>
    </div>
  );
}
