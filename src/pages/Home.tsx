import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import type L from 'leaflet';
import { useTranslation } from '@/i18n';
import Map2D from '@/components/maps/Map2D';
import EarthquakeLayer from '@/components/overlays/EarthquakeLayer';
import LayerPanel from '@/components/panels/LayerPanel';
import QuakeListing from '@/components/panels/QuakeListing';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import SourceBadge from '@/components/common/SourceBadge';
import ShareButton from '@/components/common/ShareButton';
import { useQuakes } from '@/hooks/useQuakes';
import { useAircraft } from '@/hooks/useAircraft';
import { useApplyIncomingDeepLink } from '@/hooks/useApplyIncomingDeepLink';
import { useNotificationsRunner } from '@/hooks/useNotifications';
import { remainingCooldownMs } from '@/services/openSkyRateLimit';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { activeGibsOverlays } from '@/services/gibsLayers';
import { buildShareUrl } from '@/lib/buildShareUrl';
import type { Quake } from '@/services/usgsQuakesApi';

// satellite.js entra in un chunk separato — caricato solo quando l'utente
// attiva il layer satelliti o seleziona un satellite.
const SatelliteLayer = lazy(() => import('@/components/overlays/SatelliteLayer'));
const SatelliteDetailPanel = lazy(() => import('@/components/panels/SatelliteDetailPanel'));
// Aerei: stesso pattern (chunk OpenSky a parte).
const AircraftLayer = lazy(() => import('@/components/overlays/AircraftLayer'));
const AircraftDetailPanel = lazy(() => import('@/components/panels/AircraftDetailPanel'));
// Meteo + Radar: chunk indipendenti, caricati al toggle.
const WeatherLayer = lazy(() => import('@/components/overlays/WeatherLayer'));
const WeatherDetailPanel = lazy(() => import('@/components/panels/WeatherDetailPanel'));
const RainRadarLayer = lazy(() => import('@/components/overlays/RainRadarLayer'));
const RainRadarControls = lazy(() => import('@/components/panels/RainRadarControls'));
// EONET: chunk separato (parser + categorie + dettaglio), caricato solo al toggle.
const EonetLayer = lazy(() => import('@/components/overlays/EonetLayer'));
const EonetDetailPanel = lazy(() => import('@/components/panels/EonetDetailPanel'));
// ISS: chunk dedicato (live + pass predictor + ICS export). Layer e panel
// montati solo quando il layer ISS è attivo.
const IssLayer = lazy(() => import('@/components/overlays/IssLayer'));
const IssPanel = lazy(() => import('@/components/panels/IssPanel'));
// FIRMS: due chunk separati — FireLayer (NRT con map key) e GibsFiresOverlay
// (fallback senza key). Solo uno dei due è attivo runtime.
const FireLayer = lazy(() => import('@/components/overlays/FireLayer'));
const GibsFiresOverlay = lazy(() => import('@/components/overlays/GibsFiresOverlay'));
const FireDetailPanel = lazy(() => import('@/components/panels/FireDetailPanel'));
// Lightning: chunk dedicato (TileLayer climatologia LIS in v1.0, predisposto
// per WS Blitzortung in v1.1).
const LightningLayer = lazy(() => import('@/components/overlays/LightningLayer'));
const LightningDetailPanel = lazy(() => import('@/components/panels/LightningDetailPanel'));
// Globe3D: chunk pesante (react-globe.gl + three + globe.gl). Lazy: caricato
// solo se l'utente passa in vista 3D. Mai eager.
const Globe3D = lazy(() => import('@/components/maps/Globe3D'));

const INITIAL_CENTER: [number, number] = [44.698, 10.631]; // Reggio Emilia (omaggio)
const INITIAL_ZOOM = 3;

export default function Home() {
  const { t, language } = useTranslation();
  // Applica deep link entrante (?lat=&lon=&zoom=&view=&layers=...) una sola
  // volta al mount e ripulisce la query string. Da MeteorWatch / CubeSat /
  // self-share. Vedi src/lib/deepLinkBuilder.ts per gli schemi.
  useApplyIncomingDeepLink();
  // Runner notifiche opt-in: se attivo, monitora quakes M≥5 vicini + prossimi
  // pass ISS visibili e dispara `Notification`. Cooldown 30 min per categoria.
  // Il toggle UI vive nell'Header tramite `useNotificationsControls()` (light).
  useNotificationsRunner();
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
  const weatherEnabled = useLayersStore((s) => s.overlays.weather?.enabled ?? false);
  const selectedWeather = useLayersStore((s) => s.selectedWeatherCell);
  const radarEnabled = useLayersStore((s) => s.overlays.rainviewer?.enabled ?? false);
  const eonetEnabled = useLayersStore((s) => s.overlays.eonet?.enabled ?? false);
  const eonetSelectedId = useLayersStore((s) => s.eonetSelectedEventId);
  const issEnabled = useLayersStore((s) => s.overlays.iss?.enabled ?? false);
  const firmsEnabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const selectedFireId = useLayersStore((s) => s.selectedFireId);
  const lightningEnabled = useLayersStore((s) => s.overlays.lightning?.enabled ?? false);
  const overlays = useLayersStore((s) => s.overlays);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const perfFallbackTriggered = useSettingsStore((s) => s.perfFallbackTriggered);
  const is3D = viewMode === '3d';
  const activeGibsCount = activeGibsOverlays(overlays).length;
  const show2DOnlyBanner = is3D && (activeGibsCount > 0 || lightningEnabled || radarEnabled);

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
          <div className="hidden items-center gap-2 sm:flex">
            <ShareButton
              ariaLabel={t('share.ariaLabel')}
              getPayload={() => ({
                title: 'EarthRadar — La Terra dallo spazio in tempo reale',
                text: t('common.tagline'),
                url: buildShareUrl({
                  lat: center[0],
                  lon: center[1],
                  view: viewMode,
                  overlays,
                  zoom: mapRef.current?.getZoom(),
                }),
              })}
            />
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative" style={{ height: 'min(70vh, 560px)' }}>
            {is3D ? (
              <Suspense fallback={<div className="glass h-full w-full p-4 text-sm text-space-300">{t('home.globeLoading')}</div>}>
                <Globe3D />
              </Suspense>
            ) : (
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
                {weatherEnabled && (
                  <Suspense fallback={null}>
                    <WeatherLayer />
                  </Suspense>
                )}
                {radarEnabled && (
                  <Suspense fallback={null}>
                    <RainRadarLayer />
                  </Suspense>
                )}
                {eonetEnabled && (
                  <Suspense fallback={null}>
                    <EonetLayer />
                  </Suspense>
                )}
                {issEnabled && (
                  <Suspense fallback={null}>
                    <IssLayer />
                  </Suspense>
                )}
                {firmsEnabled && (
                  <Suspense fallback={null}>
                    <FireLayer />
                  </Suspense>
                )}
                {firmsEnabled && (
                  <Suspense fallback={null}>
                    <GibsFiresOverlay />
                  </Suspense>
                )}
                {lightningEnabled && (
                  <Suspense fallback={null}>
                    <LightningLayer />
                  </Suspense>
                )}
              </Map2D>
            )}
            {!is3D && radarEnabled && (
              <Suspense fallback={null}>
                <RainRadarControls />
              </Suspense>
            )}
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

          {show2DOnlyBanner && (
            <div className="rounded-md border border-risk-mid/40 bg-risk-mid/10 px-3 py-2 text-[11px] text-risk-mid">
              ⚠ {t('home.overlayOnly2D')}
            </div>
          )}

          {perfFallbackTriggered && !is3D && (
            <div className="rounded-md border border-cyan-glow/30 bg-cyan-glow/5 px-3 py-2 text-[11px] text-cyan-glow">
              ℹ {t('home.perfFallbackInfo')}
            </div>
          )}

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
          {selectedWeather && weatherEnabled && (
            <Suspense fallback={null}>
              <WeatherDetailPanel />
            </Suspense>
          )}
          {eonetSelectedId && eonetEnabled && (
            <Suspense fallback={null}>
              <EonetDetailPanel />
            </Suspense>
          )}
          {issEnabled && (
            <Suspense fallback={null}>
              <IssPanel />
            </Suspense>
          )}
          {firmsEnabled && selectedFireId && (
            <Suspense fallback={null}>
              <FireDetailPanel />
            </Suspense>
          )}
          {lightningEnabled && (
            <Suspense fallback={null}>
              <LightningDetailPanel />
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
