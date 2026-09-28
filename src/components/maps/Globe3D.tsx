import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { translate, useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useQuakes } from '@/hooks/useQuakes';
import { useSatellites } from '@/hooks/useSatellites';
import { useIss } from '@/hooks/useIss';
import { useAircraftView } from '@/hooks/useAircraftFeed';
import { useEonet } from '@/hooks/useEonet';
import { useFires } from '@/hooks/useFires';
import { useCamCatalog } from '@/hooks/useCamCatalog';
import { useWeatherGrid } from '@/hooks/useWeatherGrid';
import { usePerfFallback } from '@/hooks/usePerfFallback';
import { autoTextureSet } from '@/lib/textureLoader';
import { quakeSeverityColor } from '@/lib/quakeFormatters';
import { eonetCategorySpec } from '@/services/eonetCategories';
import { frpColor } from '@/services/firmsApi';
import { wmoEntry } from '@/lib/wmoCodes';
import { propagateSatrec, tleToSatrec } from '@/lib/sgp4Lite';
import type { Quake } from '@/services/usgsQuakesApi';
import type { EonetEvent } from '@/services/eonetApi';
import { aircraftTitle } from '@/lib/aircraftFormat';
import type { FirmsHotspot } from '@/services/firmsApi';
import {
  aircraftSymbolScale,
  createAircraftObject,
  updateAircraftObject,
} from './aircraftGlobeObject';
import { useAircraftGlobeEntities, type AircraftGlobeEntity } from './useAircraftGlobeEntities';
import { createNightShade, startNightShadeClock } from './nightShade';
import { coverageRing, isWideGlobeView } from '@/lib/aircraftCoverage';
import {
  GLOBE_NO_CLUSTER_ALTITUDE,
  globeCellDegrees,
  globeClusterZoomAltitude,
  globeFocusAltitude,
  globeSingleRadiusDeg,
  isAtGlobeCamFloor,
  gridCluster,
  nearestPoints,
  quantizeGlobeAltitude,
  type Bounds,
  type GridItem,
} from '@/lib/camCluster';
import type { Cam } from '@/services/camCatalog';
import { CAM_LIVE_COLOR, CAM_MARKER_COLOR } from '@/services/camSources';
import { filterByType } from '@/lib/camExplorer';

/**
 * Vista 3D EarthRadar.
 *
 * Architettura
 * - Lazy chunk dedicato: react-globe.gl (~150 KB) + three (~600 KB) +
 *   globe.gl entrano qui.
 * - Tutti i layer riusano gli stessi hook della vista 2D, così non
 *   raddoppiamo il network. La differenza è solo come mappiamo i dati
 *   ai formati di react-globe.gl (pointsData / objectsData /
 *   polygonsData / pathsData / htmlElementsData).
 * - Day/night via guscio sferico con shader (vedi `nightShade.ts`):
 *   velo continuo sull'emisfero notturno, aggiornato ogni minuto.
 * - Performance fallback: vedi `usePerfFallback`. Se < 25 fps medi nei
 *   primi 3 secondi, viewMode passa a '2d' e il flag triggered è salvato.
 */

// Scala globo: react-globe.gl normalizza il raggio a 100 unità interne.
const GLOBE_RADIUS_KM = 6371;
const SATELLITE_TICK_MS = 5000;
/** Attesa a camera ferma prima di aggiornare il centro osservato (aerei, meteo). */
const POV_DEBOUNCE_MS = 1000;
/** Anello dell'area interrogata dagli aerei: appena sopra la superficie, poco visibile. */
const COVERAGE_RING_ALTITUDE = 0.0015;
const COVERAGE_RING_COLOR = 'rgba(92, 240, 255, 0.35)';
/** Massimo di punti CAM (singoli + cluster) sul globo. */
const CAM_3D_MAX_POINTS = 500;
/** Identità stabile con CAM OFF: i memo degli altri layer non si ricalcolano. */
const NO_CAM_ITEMS: GridItem<Cam>[] = [];

interface PointEntity {
  kind: 'quake' | 'eonet-point' | 'firms' | 'cam';
  lat: number;
  lng: number;
  alt: number; // altitudine relativa al raggio (0 = terra)
  color: string;
  size: number; // ridimensionato per pointAltitude (proporzionale)
  label: string;
  data: Quake | EonetEvent | FirmsHotspot | Cam;
}

interface ObjectEntity {
  kind: 'satellite' | 'iss';
  lat: number;
  lng: number;
  alt: number;
  color: string;
  noradId: number;
  name: string;
}

interface HtmlEntity {
  kind: 'weather';
  lat: number;
  lng: number;
  emoji: string;
  label: string;
  direction: string;
}

/** Cluster CAM: badge HTML a dimensione fissa in pixel (mai un poligono 3D). */
interface CamClusterHtmlEntity {
  kind: 'cam-cluster';
  lat: number;
  lng: number;
  count: number;
  bounds: Bounds;
  label: string;
  /** Il cluster contiene camere LIVE (pallino rosso sul badge). */
  hasLive: boolean;
}

interface PolygonEntity {
  kind: 'eonet-polygon';
  /** GeoJSON-style array di rings: [[lon,lat], …]. */
  coordinates: number[][][];
  color: string;
}

export default function Globe3D() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { language, t } = useTranslation();
  usePerfFallback(true);

  // -------- Sizing al container reale --------
  // react-globe.gl (via three-render-objects) usa di default
  // window.innerWidth/innerHeight come dimensioni del canvas. Senza width/
  // height espliciti, il canvas (~1920×1080) gonfia la min-content della
  // grid column "1fr" della Home: la colonna LayersPanel (320px) viene
  // spinta fuori viewport e l'utente vede uno spazio vuoto al posto del
  // pannello. Misuriamo qui il container e passiamo dimensioni reali al
  // Globe via ResizeObserver. Vedi PR fix/v1.0.2-globe-layerspanel.
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(0, Math.round(rect.width)), h: Math.max(0, Math.round(rect.height)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // -------- A11y: prefers-reduced-motion --------
  // Disabilita l'animazione di entrata se l'utente ha richiesto motion-reduce.
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  // -------- Texture adattive --------
  const textures = useMemo(autoTextureSet, []);

  // -------- Hook layer dati (stessi della 2D) --------
  const quakesEnabled = useLayersStore((s) => s.overlays.quakes?.enabled ?? true);
  const { data: quakes } = useQuakes('all_day');

  const satellitesEnabled = useLayersStore((s) => s.overlays.satellites?.enabled ?? false);
  const groups = useLayersStore((s) => s.satelliteGroups);
  const { records } = useSatellites(satellitesEnabled ? groups : []);

  const issEnabled = useLayersStore((s) => s.overlays.iss?.enabled ?? false);
  const showIssTrack = useLayersStore((s) => s.issShowGroundTrack);
  const iss = useIss(issEnabled);

  // Aerei: SOLO lettura dello store condiviso (il poller unico è pilotato dalla Home).
  const aircraftEnabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const aircraftShowOnGround = useLayersStore((s) => s.aircraftShowOnGround);
  const selectedAircraftId = useLayersStore((s) => s.selectedAircraft?.id ?? null);
  const aircraftFeed = useAircraftView();
  const aircraftShown = useMemo(
    () =>
      !aircraftEnabled
        ? []
        : aircraftShowOnGround
          ? aircraftFeed.aircraft
          : aircraftFeed.aircraft.filter((a) => !a.onGround),
    [aircraftEnabled, aircraftShowOnGround, aircraftFeed.aircraft],
  );

  const eonetEnabled = useLayersStore((s) => s.overlays.eonet?.enabled ?? false);
  const eonetCats = useLayersStore((s) => s.eonetActiveCategories);
  const eonetDays = useLayersStore((s) => s.eonetDaysRange);
  const eonetStatus = useLayersStore((s) => s.eonetStatus);
  const eonet = useEonet(eonetEnabled, {
    status: eonetStatus,
    days: eonetDays,
    categoryIds: eonetCats,
  });

  const firmsEnabled = useLayersStore((s) => s.overlays.firms?.enabled ?? false);
  const firesSource = useLayersStore((s) => s.firesSource);
  const firesDayRange = useLayersStore((s) => s.firesDayRange);
  const camEnabled = useLayersStore((s) => s.overlays.cam?.enabled ?? false);
  // Stesso catalogo (e stessa richiesta condivisa) della vista 2D.
  const { cams: allCams } = useCamCatalog(camEnabled);
  const camTypeFilter = useLayersStore((s) => s.camTypeFilter);
  // Stesso filtro TUTTE/LIVE/SNAP di CAM Explorer.
  const cams = useMemo(() => filterByType(allCams, camTypeFilter), [allCams, camTypeFilter]);
  const selectedCam = useLayersStore((s) => s.selectedCam);
  const camFocus = useLayersStore((s) => s.camFocus);

  const fires = useFires(firmsEnabled, {
    bbox: [-180, -85, 180, 85],
    source: firesSource,
    dayRange: firesDayRange,
  });

  const weatherEnabled = useLayersStore((s) => s.overlays.weather?.enabled ?? false);
  const stepKm = useLayersStore((s) => s.weatherGridStepKm);
  const mapCenter = useLayersStore((s) => s.mapCenter);
  const weather = useWeatherGrid(weatherEnabled, mapCenter[0], mapCenter[1], stepKm);

  // Aerei: oggetti THREE con identità stabile, posizioni del replay differito
  // fra due osservazioni reali (mai oltre l'ultima).
  const aircraftEntities = useAircraftGlobeEntities(
    aircraftShown,
    aircraftFeed.history,
    selectedAircraftId,
    reducedMotion,
  );

  // Centro dell'area osservata → mapCenter (usato dal poller aerei), con
  // debounce: nessuna richiesta durante rotazione/zoom, solo a camera ferma.
  const povTimerRef = useRef<number | null>(null);
  // Scala dei simboli aereo legata alla quota della camera (aggiornata solo
  // quando cambia di almeno il 15 %, per non ridisegnare a ogni frame).
  const [aircraftScale, setAircraftScale] = useState(() => aircraftSymbolScale(2.4));
  // Vista ampia: il cerchio interrogato è molto più piccolo dell'area visibile.
  const [wideView, setWideView] = useState(() => isWideGlobeView(2.4));
  // CAM: quota quantizzata (celle e raggio dei punti) e centro della vista a
  // camera ferma (camere singole più vicine quando si è molto vicini).
  const [camAltQ, setCamAltQ] = useState(() => quantizeGlobeAltitude(2.4));
  const [camCenter, setCamCenter] = useState<[number, number]>(
    () => useLayersStore.getState().mapCenter,
  );
  // Con CAM OFF nessuno stato CAM si aggiorna durante lo zoom (zero re-render).
  const camEnabledRef = useRef(camEnabled);
  useEffect(() => {
    camEnabledRef.current = camEnabled;
    const g = globeRef.current;
    if (!camEnabled || !g) return;
    const pov = g.pointOfView();
    setCamAltQ(quantizeGlobeAltitude(pov.altitude));
    setCamCenter([pov.lat, ((((pov.lng + 180) % 360) + 360) % 360) - 180]);
  }, [camEnabled]);
  // Camera scelta da CAM Explorer: centra il globo mantenendo il contesto.
  useEffect(() => {
    const g = globeRef.current;
    if (!camFocus || !g) return;
    const altitude = globeFocusAltitude(g.pointOfView().altitude);
    g.pointOfView({ lat: camFocus.lat, lng: camFocus.lon, altitude }, 1000);
  }, [camFocus]);
  const handlePovChange = useCallback((pov: { lat: number; lng: number; altitude: number }) => {
    const nextScale = aircraftSymbolScale(pov.altitude);
    setAircraftScale((cur) => (Math.abs(nextScale - cur) / cur > 0.15 ? nextScale : cur));
    setWideView(isWideGlobeView(pov.altitude));
    if (camEnabledRef.current) setCamAltQ(quantizeGlobeAltitude(pov.altitude));
    if (povTimerRef.current !== null) window.clearTimeout(povTimerRef.current);
    povTimerRef.current = window.setTimeout(() => {
      povTimerRef.current = null;
      const lng = ((((pov.lng + 180) % 360) + 360) % 360) - 180;
      if (camEnabledRef.current) setCamCenter([pov.lat, lng]);
      const [lat0, lon0] = useLayersStore.getState().mapCenter;
      if (Math.abs(pov.lat - lat0) < 0.1 && Math.abs(lng - lon0) < 0.1) return;
      useLayersStore.getState().setMapCenter([pov.lat, lng]);
    }, POV_DEBOUNCE_MS);
  }, []);
  useEffect(
    () => () => {
      if (povTimerRef.current !== null) window.clearTimeout(povTimerRef.current);
    },
    [],
  );

  // Callback stabili: una funzione nuova per `customThreeObject` farebbe
  // ricreare a three-globe tutti gli oggetti a ogni render.
  const updateAircraftCallback = useCallback(
    (obj: THREE.Object3D, d: object, globeRadius?: number) =>
      updateAircraftObject(obj, d as AircraftGlobeEntity, globeRadius ?? 100, aircraftScale),
    [aircraftScale],
  );
  const aircraftLabelCallback = useCallback(
    (d: object) => aircraftLabel(d as AircraftGlobeEntity, language),
    [language],
  );
  const aircraftClickCallback = useCallback(
    (d: object) => {
      const e = d as AircraftGlobeEntity;
      useLayersStore
        .getState()
        .setSelectedAircraft({ id: e.id, label: aircraftTitle(e.aircraft, language) });
    },
    [language],
  );

  // Nuovo array al cambio di scala: forza l'aggiornamento degli oggetti esistenti.
  const aircraftLayerData = useMemo(
    () => [...aircraftEntities],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aircraftEntities, aircraftScale],
  );

  // -------- Tick per propagazione satelliti / ISS --------
  const tickRef = useRef(Date.now());
  const [, setTickBump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      tickRef.current = Date.now();
      setTickBump((v) => v + 1);
    }, SATELLITE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // -------- Trasformazioni --------

  // CAM: da lontano cluster a griglia (celle in gradi ∝ quota); da vicino le
  // camere singole più vicine al centro della vista. Sempre ≤ 500 elementi.
  const camItems = useMemo<GridItem<Cam>[]>(() => {
    if (!camEnabled || cams.length === 0) return NO_CAM_ITEMS;
    if (camAltQ <= GLOBE_NO_CLUSTER_ALTITUDE) {
      return nearestPoints(cams, camCenter[0], camCenter[1], CAM_3D_MAX_POINTS).map((c) => ({
        kind: 'single' as const,
        lat: c.lat,
        lon: c.lon,
        point: c,
      }));
    }
    const cell = globeCellDegrees(camAltQ);
    return gridCluster(
      cams,
      (c) => [Math.floor(c.lat / cell), Math.floor(c.lon / cell)],
      CAM_3D_MAX_POINTS,
      (c) => c.type === 'live',
    );
  }, [camEnabled, cams, camAltQ, camCenter]);

  const camPointSize = camEnabled ? globeSingleRadiusDeg(camAltQ) : 0;

  // Points: quakes + eonet-point + firms + camere singole (tutti "a terra")
  const pointsData = useMemo<PointEntity[]>(() => {
    const out: PointEntity[] = [];
    if (quakesEnabled) {
      for (const q of quakes) {
        out.push({
          kind: 'quake',
          lat: q.lat,
          lng: q.lon,
          alt: 0.005 + Math.max(0, q.magnitude) * 0.01,
          color: quakeSeverityColor(q.magnitude),
          size: Math.max(0.15, q.magnitude * 0.18),
          label: `M ${q.magnitude.toFixed(1)} · ${q.place ?? ''}`,
          data: q,
        });
      }
    }
    if (eonetEnabled) {
      for (const e of eonet.data) {
        const last = [...e.geometry].reverse().find((g) => g.type === 'Point');
        if (!last || last.type !== 'Point') continue;
        const cat = eonetCategorySpec(e.categories[0]?.id);
        out.push({
          kind: 'eonet-point',
          lat: last.coordinates[1],
          lng: last.coordinates[0],
          alt: 0.01,
          color: cat.color,
          size: 0.3,
          label: `${cat.emoji} ${e.title}`,
          data: e,
        });
      }
    }
    if (firmsEnabled && fires.mode === 'firms') {
      for (const h of fires.hotspots.slice(0, 500)) {
        out.push({
          kind: 'firms',
          lat: h.lat,
          lng: h.lon,
          alt: 0.003,
          color: frpColor(h.frp),
          size: 0.15 + Math.min(0.3, h.frp / 1000),
          label: `🔥 ${h.frp.toFixed(0)} MW · ${h.acqDate}`,
          data: h,
        });
      }
    }
    if (camEnabled && selectedCam) {
      // Camera selezionata sempre visibile (anche dentro un cluster), in evidenza.
      const sel = allCams.find((c) => c.source === selectedCam.source && c.id === selectedCam.id);
      if (sel) {
        out.push({
          kind: 'cam',
          lat: sel.lat,
          lng: sel.lon,
          alt: 0.003,
          color: '#ff5cd0',
          size: camPointSize * 1.8,
          label: `📷 ${escapeHtml(sel.name)} · SNAP`,
          data: sel,
        });
      }
    }
    for (const it of camItems) {
      if (it.kind !== 'single') continue;
      out.push({
        kind: 'cam',
        lat: it.lat,
        lng: it.lon,
        alt: 0.001,
        // LIVE: piccolo punto rosso; SNAP: indicatore CAM viola.
        color: it.point.type === 'live' ? CAM_LIVE_COLOR : CAM_MARKER_COLOR,
        size: camPointSize,
        label: `📷 ${escapeHtml(it.point.name)} · ${it.point.type === 'live' ? '▶ LIVE' : 'SNAP'}`,
        data: it.point,
      });
    }
    return out;
  }, [
    quakesEnabled,
    quakes,
    eonetEnabled,
    eonet.data,
    firmsEnabled,
    fires.mode,
    fires.hotspots,
    camItems,
    camPointSize,
    camEnabled,
    allCams,
    selectedCam,
  ]);

  // Objects: satelliti + ISS (sfere THREE custom a quota reale scalata)
  const objectsData = useMemo<ObjectEntity[]>(() => {
    const out: ObjectEntity[] = [];
    if (satellitesEnabled) {
      const tickDate = new Date(tickRef.current);
      for (const rec of records) {
        try {
          const sat = tleToSatrec(rec.tle);
          const p = propagateSatrec(sat, tickDate);
          if (!p) continue;
          out.push({
            kind: 'satellite',
            lat: p.lat,
            lng: p.lon,
            alt: p.alt / GLOBE_RADIUS_KM, // scala reale orbitale
            color: '#5cf0ff',
            noradId: rec.noradId,
            name: rec.name,
          });
        } catch {
          /* skip */
        }
      }
    }
    if (issEnabled && iss.smoothLat !== null && iss.smoothLon !== null && iss.smoothAltKm !== null) {
      out.push({
        kind: 'iss',
        lat: iss.smoothLat,
        lng: iss.smoothLon,
        alt: iss.smoothAltKm / GLOBE_RADIUS_KM,
        color: iss.live?.visibility === 'eclipsed' ? '#5cf0ff' : '#ffd166',
        noradId: 25544,
        name: 'ISS (ZARYA)',
      });
    }
    return out;
  }, [
    satellitesEnabled,
    records,
    issEnabled,
    iss.smoothLat,
    iss.smoothLon,
    iss.smoothAltKm,
    iss.live,
  ]);

  // ISS ground track ±45 min come pathsData (un'unica path).
  // Area interrogata dal traffico aereo: anello discreto (150 NM dal centro
  // effettivo della richiesta, restituito dal gateway).
  const coverageArea = aircraftEnabled ? aircraftFeed.snapshot?.area : undefined;
  const coveragePath = useMemo(() => {
    if (!coverageArea) return [];
    const path = coverageRing(coverageArea.lat, coverageArea.lon, coverageArea.radiusNm).map(
      ([lat, lon]) => [lat, lon, COVERAGE_RING_ALTITUDE] as [number, number, number],
    );
    return [{ path, color: COVERAGE_RING_COLOR, stroke: null }];
  }, [coverageArea]);

  const issPath = useMemo(() => {
    if (!issEnabled || !showIssTrack || !iss.satrec) return [];
    const now = Date.now();
    const start = now - 45 * 60_000;
    const end = now + 45 * 60_000;
    const path: Array<[number, number, number]> = [];
    for (let t = start; t <= end; t += 30_000) {
      const p = propagateSatrec(iss.satrec, new Date(t));
      if (!p) continue;
      path.push([p.lat, p.lon, p.alt / GLOBE_RADIUS_KM]);
    }
    return path.length > 1 ? [{ path, color: '#5cf0ff', stroke: 1.4 }] : [];
  }, [issEnabled, showIssTrack, iss.satrec]);
  const pathsData = useMemo(() => [...issPath, ...coveragePath], [issPath, coveragePath]);

  // Polygons: EONET (la notte è un guscio a parte, vedi effetto "Velo notturno").
  const polygonsData = useMemo<PolygonEntity[]>(() => {
    const out: PolygonEntity[] = [];
    if (eonetEnabled) {
      for (const e of eonet.data) {
        for (const g of e.geometry) {
          if (g.type !== 'Polygon') continue;
          const cat = eonetCategorySpec(e.categories[0]?.id);
          out.push({
            kind: 'eonet-polygon',
            coordinates: g.coordinates as number[][][],
            color: cat.color,
          });
        }
      }
    }
    return out;
  }, [eonetEnabled, eonet.data]);

  // Weather emoji come htmlElementsData (8 celle).
  const htmlElementsData = useMemo<HtmlEntity[]>(() => {
    if (!weatherEnabled) return [];
    const out: HtmlEntity[] = [];
    if (weather.center) {
      const wmo = wmoEntry(weather.center.weatherCode);
      out.push({
        kind: 'weather',
        lat: weather.center.lat,
        lng: weather.center.lon,
        emoji: wmo.emoji,
        label: `${weather.center.temperatureC?.toFixed(0) ?? '—'} °C`,
        direction: 'CENTER',
      });
    }
    for (const c of weather.cells) {
      const wmo = wmoEntry(c.weatherCode);
      out.push({
        kind: 'weather',
        lat: c.lat,
        lng: c.lon,
        emoji: wmo.emoji,
        label: `${c.temperatureC?.toFixed(0) ?? '—'} °C`,
        direction: c.direction,
      });
    }
    return out;
  }, [weatherEnabled, weather.center, weather.cells]);

  // Cluster CAM come badge HTML (dimensione fissa a schermo, con conteggio).
  const htmlData = useMemo<Array<HtmlEntity | CamClusterHtmlEntity>>(() => {
    const clusters: CamClusterHtmlEntity[] = [];
    for (const it of camItems) {
      if (it.kind !== 'cluster') continue;
      clusters.push({
        kind: 'cam-cluster',
        lat: it.lat,
        lng: it.lon,
        count: it.count,
        bounds: it.bounds,
        hasLive: it.flagged > 0,
        label: translate(language, 'cam.cluster', { count: it.count }),
      });
    }
    return clusters.length > 0 ? [...htmlElementsData, ...clusters] : htmlElementsData;
  }, [htmlElementsData, camItems, language]);

  // -------- Setup imperativo controlli (auto-rotate molto leggero) --------
  const globeMounted = size.w > 0 && size.h > 0;
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls() as unknown as {
      autoRotate: boolean;
      autoRotateSpeed: number;
      enableDamping: boolean;
      dampingFactor: number;
    };
    controls.autoRotate = false; // l'utente sceglie di interagire, niente rotazione forzata
    controls.enableDamping = true;
    controls.dampingFactor = 0.18;
    // Vista iniziale centrata sul centro mappa corrente (default Reggio Emilia),
    // così l'area osservata è significativa fin dall'apertura.
    const [lat0, lon0] = useLayersStore.getState().mapCenter;
    g.pointOfView({ lat: lat0, lng: lon0, altitude: 2.4 }, 0);
    // Il <Globe> è montato solo dopo la prima misura del container: questo
    // effetto deve ripartire allora, altrimenti il globo resta su (0, 0).
  }, [globeMounted]);

  // -------- Velo notturno --------
  // Guscio sferico con shader aggiunto direttamente alla scena: nessuna
  // triangolazione (niente buchi), aggiornato ogni minuto cambiando un solo
  // uniform, senza re-render React.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const scene = g.scene();
    const shade = createNightShade(g.getGlobeRadius());
    scene.add(shade.mesh);
    const stop = startNightShadeClock(shade.update);
    return () => {
      stop();
      scene.remove(shade.mesh);
      shade.dispose();
    };
  }, [globeMounted]);

  // -------- Render --------
  // Dimensioni: passiamo width/height espliciti misurati con ResizeObserver
  // perché three-render-objects usa di default window.innerWidth/innerHeight
  // (non auto-sizing al parent come pensavamo in v1.0).
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-space-500/30 bg-space-950"
      role="region"
      aria-label={language === 'it' ? 'Globo 3D interattivo' : 'Interactive 3D globe'}
    >
      {size.w > 0 && size.h > 0 && (
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(5,7,15,1)"
        globeImageUrl={textures.blueMarble}
        bumpImageUrl={textures.bumpMap ?? undefined}
        atmosphereColor="#5cf0ff"
        atmosphereAltitude={0.16}
        showAtmosphere
        animateIn={!reducedMotion}
        // Points
        pointsData={pointsData}
        pointLat={(d: object) => (d as PointEntity).lat}
        pointLng={(d: object) => (d as PointEntity).lng}
        pointAltitude={(d: object) => (d as PointEntity).alt}
        pointRadius={(d: object) => (d as PointEntity).size}
        pointColor={(d: object) => (d as PointEntity).color}
        pointLabel={(d: object) => (d as PointEntity).label}
        onPointClick={(d: object) => handlePointClick(d as PointEntity)}
        // Aerei: layer custom (simbolo THREE leggero orientato sulla rotta reale)
        customLayerData={aircraftLayerData}
        customThreeObject={createAircraftObject}
        customThreeObjectUpdate={updateAircraftCallback}
        customLayerLabel={aircraftLabelCallback}
        onCustomLayerClick={aircraftClickCallback}
        onZoom={handlePovChange}
        // Custom THREE objects (satelliti, ISS)
        objectsData={objectsData}
        objectLat={(d: object) => (d as ObjectEntity).lat}
        objectLng={(d: object) => (d as ObjectEntity).lng}
        objectAltitude={(d: object) => (d as ObjectEntity).alt}
        objectLabel={(d: object) => (d as ObjectEntity).name}
        objectThreeObject={(d: object) => makeSatMesh(d as ObjectEntity)}
        onObjectClick={(d: object) => handleObjectClick(d as ObjectEntity)}
        // Paths (ISS ground track)
        pathsData={pathsData}
        pathPoints={(d: object) => (d as { path: Array<[number, number, number]> }).path}
        pathPointLat={(p: unknown) => (p as [number, number, number])[0]}
        pathPointLng={(p: unknown) => (p as [number, number, number])[1]}
        pathPointAlt={(p: unknown) => (p as [number, number, number])[2]}
        pathColor={(d: object) => (d as { color: string }).color}
        pathStroke={(d: object) => (d as { stroke: number | null }).stroke}
        // Polygons (notte + EONET)
        polygonsData={polygonsData}
        polygonGeoJsonGeometry={
          ((d: object) => ({
            type: 'Polygon',
            coordinates: (d as PolygonEntity).coordinates,
          })) as never
        }
        polygonCapColor={(d: object) => `${(d as PolygonEntity).color}33`}
        polygonSideColor={(d: object) => `${(d as PolygonEntity).color}22`}
        polygonStrokeColor={(d: object) => `${(d as PolygonEntity).color}aa`}
        polygonAltitude={() => 0.001}
        // HTML: emoji meteo + badge dei cluster CAM
        htmlElementsData={htmlData}
        htmlLat={(d: object) => (d as HtmlEntity).lat}
        htmlLng={(d: object) => (d as HtmlEntity).lng}
        htmlElement={(d: object) =>
          (d as CamClusterHtmlEntity).kind === 'cam-cluster'
            ? buildCamClusterBadge(d as CamClusterHtmlEntity, zoomToCamCluster)
            : buildWeatherChip(d as HtmlEntity)
        }
        // Localizzazione tooltip (lang non passa, ma il label l'abbiamo già localizzato)
        labelsTransitionDuration={400}
        rendererConfig={{ alpha: true, antialias: false }}
      />
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md border border-cyan-glow/30 bg-space-900/80 px-2 py-1 font-mono text-[10px] tracking-wide text-cyan-glow shadow-glow backdrop-blur-md">
        Blue Marble · Black Marble — NASA Visible Earth · {language}
      </div>
      {coverageArea && wideView && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-[400] -translate-x-1/2 rounded-md border border-space-500/40 bg-space-900/75 px-2.5 py-1 text-center text-[11px] leading-snug text-space-200 backdrop-blur-md">
          {t('aircraft.coverage')}
          <span className="block text-[10px] text-space-300">{t('aircraft.zoomHint')}</span>
        </div>
      )}
    </div>
  );

  function handlePointClick(p: PointEntity) {
    if (p.kind === 'eonet-point') {
      const e = p.data as EonetEvent;
      useLayersStore.getState().setEonetSelectedEventId(e.id);
    } else if (p.kind === 'firms') {
      const h = p.data as FirmsHotspot;
      useLayersStore
        .getState()
        .setSelectedFireId(`${h.lat.toFixed(4)},${h.lon.toFixed(4)},${h.acqDate},${h.acqTime}`);
    } else if (p.kind === 'cam') {
      const c = p.data as Cam;
      useLayersStore.getState().setSelectedCam({ source: c.source, id: c.id });
    }
  }

  /**
   * Avvicina la camera sul cluster quanto basta perché i membri si separino,
   * senza scendere sotto la quota leggibile. Già lì: apre CAM Explorer
   * ("Zona mappa") centrato sul cluster.
   */
  function zoomToCamCluster(c: CamClusterHtmlEntity) {
    const g = globeRef.current;
    if (!g) return;
    const current = g.pointOfView().altitude;
    if (isAtGlobeCamFloor(current)) {
      g.pointOfView({ lat: c.lat, lng: c.lng, altitude: current }, 700);
      useLayersStore.getState().setMapCenter([c.lat, c.lng]);
      useLayersStore.getState().setCamExplorerMode('near');
      useLayersStore.getState().setCamExplorerOpen(true);
      return;
    }
    const altitude = globeClusterZoomAltitude(c.bounds, current);
    g.pointOfView({ lat: c.lat, lng: c.lng, altitude }, 900);
  }

  function handleObjectClick(o: ObjectEntity) {
    if (o.kind === 'satellite' || o.kind === 'iss') {
      useLayersStore.getState().setSelectedSatellite({ noradId: o.noradId, name: o.name });
    }
  }
}

function aircraftLabel(e: AircraftGlobeEntity, language: string): string {
  const a = e.aircraft;
  const it = language === 'it';
  const alt =
    e.altitudeKind === 'ground'
      ? it
        ? 'a terra'
        : 'on ground'
      : e.altitudeKind === 'unknown'
        ? it
          ? 'quota n.d.'
          : 'altitude n/a'
        : `${Math.round((a.altBaroM ?? a.altGeomM ?? 0) / 100) / 10} km`;
  return [aircraftTitle(a, language), a.typeCode, alt].filter(Boolean).join(' · ');
}

/** I label del globo sono HTML: i testi del catalogo CAM vanno sempre escapati. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Costruisce un piccolo mesh THREE per i satelliti / ISS. */
function makeSatMesh(o: ObjectEntity): THREE.Object3D {
  const geom = new THREE.SphereGeometry(o.kind === 'iss' ? 1.2 : 0.6, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: o.color });
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}

/** Badge circolare del cluster CAM: numero di camere, dimensione fissa in pixel. */
function buildCamClusterBadge(
  c: CamClusterHtmlEntity,
  onClick: (c: CamClusterHtmlEntity) => void,
): HTMLElement {
  const size = c.count >= 100 ? 38 : c.count >= 10 ? 32 : 26;
  const el = document.createElement('button');
  el.type = 'button';
  el.style.cssText = `
    pointer-events: auto;
    cursor: pointer;
    transform: translate(-50%, -50%);
    width: ${size}px;
    height: ${size}px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 9999px;
    border: 1.5px solid ${CAM_MARKER_COLOR};
    background: rgba(11,16,32,0.85);
    box-shadow: 0 0 10px ${CAM_MARKER_COLOR}88;
    color: #ede9fe;
    font: 600 11px ui-monospace, monospace;
    line-height: 1;
  `;
  el.textContent = String(Math.floor(c.count));
  if (c.hasLive) {
    el.style.position = 'relative';
    const dot = document.createElement('span');
    dot.style.cssText = `position:absolute;top:-1px;right:-1px;width:9px;height:9px;border-radius:9999px;background:${CAM_LIVE_COLOR};border:1.5px solid #0b1020;`;
    el.appendChild(dot);
  }
  el.title = c.label;
  el.setAttribute('aria-label', `📷 ${c.label}`);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(c);
  });
  return el;
}

/** Crea un chip HTML per la cella weather (htmlElementsData). */
function buildWeatherChip(d: HtmlEntity): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `
    pointer-events: none;
    transform: translate(-50%, -50%);
    padding: 2px 6px;
    border-radius: 9999px;
    background: rgba(11,16,32,0.85);
    border: 1px solid rgba(92,240,255,0.35);
    color: #5cf0ff;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    line-height: 1;
    white-space: nowrap;
  `;
  el.textContent = `${d.emoji} ${d.label}`;
  return el;
}
