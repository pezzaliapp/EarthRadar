import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useQuakes } from '@/hooks/useQuakes';
import { useSatellites } from '@/hooks/useSatellites';
import { useIss } from '@/hooks/useIss';
import { useAircraft } from '@/hooks/useAircraft';
import { useEonet } from '@/hooks/useEonet';
import { useFires } from '@/hooks/useFires';
import { useWeatherGrid } from '@/hooks/useWeatherGrid';
import { usePerfFallback } from '@/hooks/usePerfFallback';
import { autoTextureSet } from '@/lib/textureLoader';
import { quakeSeverityColor } from '@/lib/quakeFormatters';
import { eonetCategorySpec } from '@/services/eonetCategories';
import { frpColor } from '@/services/firmsApi';
import { wmoEntry } from '@/lib/wmoCodes';
import { propagateSatrec, tleToSatrec } from '@/lib/sgp4Lite';
import { subsolarPoint } from '@/lib/dayNightTerminator';
import type { Quake } from '@/services/usgsQuakesApi';
import type { Aircraft } from '@/services/openSkyApi';
import type { EonetEvent } from '@/services/eonetApi';
import type { FirmsHotspot } from '@/services/firmsApi';

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
 * - Day/night via overlay polygon "calotta antisolare" semitrasparente,
 *   ricalcolato ogni minuto dal `subsolarPoint`.
 * - Performance fallback: vedi `usePerfFallback`. Se < 25 fps medi nei
 *   primi 3 secondi, viewMode passa a '2d' e il flag triggered è salvato.
 */

// Scala globo: react-globe.gl normalizza il raggio a 100 unità interne.
const GLOBE_RADIUS_KM = 6371;
const SATELLITE_TICK_MS = 5000;

interface PointEntity {
  kind: 'quake' | 'aircraft' | 'eonet-point' | 'firms';
  lat: number;
  lng: number;
  alt: number; // altitudine relativa al raggio (0 = terra)
  color: string;
  size: number; // ridimensionato per pointAltitude (proporzionale)
  label: string;
  data: Quake | Aircraft | EonetEvent | FirmsHotspot;
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

interface PolygonEntity {
  kind: 'night' | 'eonet-polygon';
  /** GeoJSON-style array di rings: [[lon,lat], …]. */
  coordinates: number[][][];
  color: string;
}

export default function Globe3D() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { language } = useTranslation();
  usePerfFallback(true);

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

  const aircraftEnabled = useLayersStore((s) => s.overlays.aircraft?.enabled ?? false);
  const aircraft = useAircraft(aircraftEnabled);

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
  const fires = useFires(firmsEnabled, {
    bbox: [-180, -85, 180, 85],
    source: firesSource,
    dayRange: firesDayRange,
  });

  const weatherEnabled = useLayersStore((s) => s.overlays.weather?.enabled ?? false);
  const stepKm = useLayersStore((s) => s.weatherGridStepKm);
  const mapCenter = useLayersStore((s) => s.mapCenter);
  const weather = useWeatherGrid(weatherEnabled, mapCenter[0], mapCenter[1], stepKm);

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

  // Points: quakes + aircraft + eonet-point + firms (tutti "a terra")
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
    if (aircraftEnabled) {
      for (const a of aircraft.data) {
        if (a.onGround) continue;
        const alt = (a.baroAltM ?? 11000) / GLOBE_RADIUS_KM / 1000;
        out.push({
          kind: 'aircraft',
          lat: a.lat,
          lng: a.lon,
          alt,
          color: '#5cf0ff',
          size: 0.18,
          label: `${a.callsign || a.icao24} · ${a.originCountry}`,
          data: a,
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
    return out;
  }, [
    quakesEnabled,
    quakes,
    aircraftEnabled,
    aircraft.data,
    eonetEnabled,
    eonet.data,
    firmsEnabled,
    fires.mode,
    fires.hotspots,
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
  const pathsData = useMemo(() => {
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
    return path.length > 1 ? [{ path, color: '#5cf0ff' }] : [];
  }, [issEnabled, showIssTrack, iss.satrec]);

  // Polygons: notte (calotta antisolar) + EONET polygons.
  const polygonsData = useMemo<PolygonEntity[]>(() => {
    const out: PolygonEntity[] = [];
    // Notte: ring lungo il terminatore + corona antisolar.
    out.push(buildNightPolygon(new Date(tickRef.current)));
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

  // -------- Setup imperativo controlli (auto-rotate molto leggero) --------
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
    g.pointOfView({ lat: 30, lng: 10, altitude: 2.4 }, 0);
  }, []);

  // -------- Render --------
  // Dimensioni: react-globe.gl si auto-sizing al parent se non si passano w/h.
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-space-500/30 bg-space-950"
      role="region"
      aria-label={language === 'it' ? 'Globo 3D interattivo' : 'Interactive 3D globe'}
    >
      <Globe
        ref={globeRef}
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
        pathColor={() => '#5cf0ff'}
        pathStroke={1.4}
        // Polygons (notte + EONET)
        polygonsData={polygonsData}
        polygonGeoJsonGeometry={
          ((d: object) => ({
            type: 'Polygon',
            coordinates: (d as PolygonEntity).coordinates,
          })) as never
        }
        polygonCapColor={(d: object) => {
          const e = d as PolygonEntity;
          if (e.kind === 'night') return 'rgba(5,7,15,0.55)';
          return `${e.color}33`;
        }}
        polygonSideColor={(d: object) => {
          const e = d as PolygonEntity;
          if (e.kind === 'night') return 'rgba(0,0,0,0)';
          return `${e.color}22`;
        }}
        polygonStrokeColor={(d: object) => {
          const e = d as PolygonEntity;
          if (e.kind === 'night') return 'rgba(0,0,0,0)';
          return `${e.color}aa`;
        }}
        polygonAltitude={() => 0.001}
        // HTML weather emojis
        htmlElementsData={htmlElementsData}
        htmlLat={(d: object) => (d as HtmlEntity).lat}
        htmlLng={(d: object) => (d as HtmlEntity).lng}
        htmlElement={(d: object) => buildWeatherChip(d as HtmlEntity)}
        // Localizzazione tooltip (lang non passa, ma il label l'abbiamo già localizzato)
        labelsTransitionDuration={400}
        rendererConfig={{ alpha: true, antialias: false }}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md border border-cyan-glow/30 bg-space-900/80 px-2 py-1 font-mono text-[10px] tracking-wide text-cyan-glow shadow-glow backdrop-blur-md">
        Blue Marble · Black Marble — NASA Visible Earth · {language}
      </div>
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
    } else if (p.kind === 'aircraft') {
      const a = p.data as Aircraft;
      useLayersStore.getState().setSelectedAircraft({ icao24: a.icao24, callsign: a.callsign });
    }
  }

  function handleObjectClick(o: ObjectEntity) {
    if (o.kind === 'satellite' || o.kind === 'iss') {
      useLayersStore.getState().setSelectedSatellite({ noradId: o.noradId, name: o.name });
    }
  }
}

/**
 * Costruisce il polygon "notte" come calotta sferica antisolar di raggio π/2.
 * react-globe.gl renderizza polygonsData come geometrie GeoJSON, supporta
 * lat/lng. Approssimo la calotta come un cerchio sulla sfera con 96
 * vertici, calcolati come distance-π/2 dal punto subsolare.
 */
function buildNightPolygon(now: Date): PolygonEntity {
  const [subLat, subLon] = subsolarPoint(now);
  // Antisolar = lato opposto della Terra
  const antiLat = -subLat;
  const antiLon = ((subLon + 180 + 540) % 360) - 180;
  const ring: Array<[number, number]> = [];
  const SAMPLES = 96;
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const dist = Math.PI / 2; // raggio angolare 90°
  const phiC = antiLat * DEG;
  const lamC = antiLon * DEG;
  for (let i = 0; i <= SAMPLES; i++) {
    const tBearing = (i / SAMPLES) * 2 * Math.PI;
    const phi = Math.asin(
      Math.sin(phiC) * Math.cos(dist) + Math.cos(phiC) * Math.sin(dist) * Math.cos(tBearing),
    );
    const lam =
      lamC +
      Math.atan2(
        Math.sin(tBearing) * Math.sin(dist) * Math.cos(phiC),
        Math.cos(dist) - Math.sin(phiC) * Math.sin(phi),
      );
    let lonDeg = lam * RAD;
    lonDeg = ((lonDeg + 540) % 360) - 180;
    ring.push([lonDeg, phi * RAD]);
  }
  return { kind: 'night', coordinates: [ring], color: '#000000' };
}

/** Costruisce un piccolo mesh THREE per i satelliti / ISS. */
function makeSatMesh(o: ObjectEntity): THREE.Object3D {
  const geom = new THREE.SphereGeometry(o.kind === 'iss' ? 1.2 : 0.6, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: o.color });
  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
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
