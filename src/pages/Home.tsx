import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import type L from 'leaflet';
import { useTranslation } from '@/i18n';
import Map2D from '@/components/maps/Map2D';
import EarthquakeLayer from '@/components/overlays/EarthquakeLayer';
import LayerPanel from '@/components/panels/LayerPanel';
import QuakeListing from '@/components/panels/QuakeListing';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import SourceBadge from '@/components/common/SourceBadge';
import { useQuakes } from '@/hooks/useQuakes';
import { useAircraft } from '@/hooks/useAircraft';
import { remainingCooldownMs } from '@/services/openSkyRateLimit';
import { useLayersStore } from '@/store/layersStore';
import type { Quake } from '@/services/usgsQuakesApi';

// satellite.js entra in un chunk separato — caricato solo quando l'utente
// attiva il layer satelliti o seleziona un satellite.
const SatelliteLayer = lazy(() => import('@/components/overlays/SatelliteLayer'));
const SatelliteDetailPanel = lazy(() => import('@/components/panels/SatelliteDetailPanel'));
// Aerei: stesso pattern (chunk OpenSky a parte).
const AircraftLayer = lazy(() => import('@/components/overlays/AircraftLayer'));
const AircraftDetailPanel = lazy(() => import('@/components/panels/AircraftDetailPanel'));

const INITIAL_CENTER: [number, number] = [44.698, 10.631]; // Reggio Emilia (omaggio)
const INITIAL_ZOOM = 3;

export default function Home() {
  const { t, language } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPanelMobile, setShowPanelMobile] = useState(false);

  const {
    data: quakes,
    source: quakeSource,
    loading: quakeLoading,
    fetchedAt: quakeFetchedAt,
    error: quakeError,
    refresh: refreshQuakes,
  } = useQuakes('all_day');

  const satellitesEnabled = useLayersStore((s) => s.overlays.satellites?.enabled ?? false);
  const selectedSat = useLayersStore((s) => s.selectedSatellite);
  const aircraftEnabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const selectedAircraft = useLayersStore((s) => s.selectedAircraft);

  const aircraft = useAircraft(aircraftEnabled);

  const flyToQuake = useCallback((q: Quake) => {
    setSelectedId(q.id);
    setCenter([q.lat, q.lon]);
    const map = mapRef.current;
    if (!map) return;
    const target: L.LatLngExpression = [q.lat, q.lon];
    map.flyTo(target, Math.max(map.getZoom(), 5), { duration: 0.6 });
  }, []);

  return (
    <div className="space-y-5">
      <section className="glass-strong space-y-3 p-5 shadow-glow sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-space-50 sm:text-3xl">
              {t('home.headline')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-space-200">{t('home.intro')}</p>
          </div>
          <div className="hidden sm:block">
            <ViewModeToggle />
          </div>
        </div>
        <div className="rounded-xl border border-cyan-glow/30 bg-cyan-glow/5 px-4 py-2.5 text-xs text-cyan-glow">
          {t('home.phase1Notice')}
        </div>
        <div className="sm:hidden">
          <ViewModeToggle />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <div className="relative" style={{ height: 'min(70vh, 560px)' }}>
            <Map2D mapRef={mapRef} initialCenter={INITIAL_CENTER} initialZoom={INITIAL_ZOOM} height="100%">
              <EarthquakeLayer quakes={quakes} onSelect={flyToQuake} />
              {satellitesEnabled && (
                <Suspense fallback={null}>
                  <SatelliteLayer />
                </Suspense>
              )}
              {aircraftEnabled && (
                <Suspense fallback={null}>
                  <AircraftLayer />
                </Suspense>
              )}
            </Map2D>
            <button
              type="button"
              className="absolute right-3 top-3 z-[400] inline-flex items-center gap-1 rounded-lg border border-cyan-glow/40 bg-space-900/80 px-2 py-1 text-[11px] font-mono uppercase tracking-wider text-cyan-glow shadow-glow backdrop-blur-md lg:hidden"
              onClick={() => setShowPanelMobile((v) => !v)}
              aria-expanded={showPanelMobile}
              aria-controls="layer-panel-mobile"
            >
              {showPanelMobile ? t('home.closeLayers') : t('home.openLayers')}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge
                sourceLabel="USGS"
                source={quakeSource}
                loading={quakeLoading}
                error={quakeError}
                fetchedAt={quakeFetchedAt}
                language={language}
              />
              {aircraftEnabled && (
                <SourceBadge
                  sourceLabel="OpenSky"
                  source={aircraft.source}
                  loading={aircraft.loading}
                  error={aircraft.error}
                  fetchedAt={aircraft.fetchedAt}
                  cooldownMs={aircraft.rateLimit ? remainingCooldownMs(aircraft.rateLimit) : 0}
                  language={language}
                />
              )}
            </div>
            <button
              type="button"
              className="btn-ghost h-7 px-2 py-0 text-[11px]"
              onClick={() => refreshQuakes()}
              disabled={quakeLoading}
            >
              ↻ {t('common.retry')}
            </button>
          </div>
        </div>

        <div
          id="layer-panel-mobile"
          className={`${showPanelMobile ? '' : 'hidden'} space-y-3 lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}
        >
          {selectedSat && (
            <Suspense fallback={null}>
              <SatelliteDetailPanel />
            </Suspense>
          )}
          {selectedAircraft && (
            <Suspense fallback={null}>
              <AircraftDetailPanel />
            </Suspense>
          )}
          <LayerPanel />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="label">{t('home.listingTitle')}</h2>
        {quakeLoading && quakes.length === 0 ? (
          <div className="glass p-4 text-sm text-space-300">{t('quakes.loading')}</div>
        ) : (
          <QuakeListing
            quakes={quakes}
            center={center}
            onSelect={flyToQuake}
            selectedId={selectedId}
            limit={30}
          />
        )}
      </section>
    </div>
  );
}
