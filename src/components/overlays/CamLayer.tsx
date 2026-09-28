import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from '@/i18n';
import { useLayersStore } from '@/store/layersStore';
import { useCamCatalog } from '@/hooks/useCamCatalog';
import { camKey, type Cam } from '@/services/camCatalog';
import { CAM_LIVE_COLOR, CAM_MARKER_COLOR as CAM_COLOR, CAM_SOURCES } from '@/services/camSources';
import { filterByType } from '@/lib/camExplorer';
import { gridCluster, inBounds, padBounds, type Bounds, type GridItem } from '@/lib/camCluster';

/**
 * Overlay CAM (2D). Montato solo con CAM ON.
 *
 *  - Viewport filtering (bounds + 20 %) ricalcolato solo a moveend/zoomend.
 *  - Clustering a griglia in pixel (celle da 56 px); punti singoli da zoom 15
 *    o dallo zoom massimo della mappa base (GIBS si ferma a 9).
 *  - Al massimo 1.000 elementi disegnati; i singoli su canvas condiviso.
 *  - La camera selezionata è sempre visibile, anche dentro un cluster.
 *  - Click su un cluster: zoom se possibile, altrimenti CAM Explorer "Zona mappa".
 *  - LIVE: piccolo punto rosso (singoli) / pallino rosso sul badge (cluster).
 *  - Segue il filtro TUTTE/LIVE/SNAP di CAM Explorer.
 *  - Nessuna immagine né video caricati dai marker: solo nella CamCard.
 */

export const CAM_2D_MAX_ITEMS = 1000;
const CELL_PX = 56;
const NO_CLUSTER_ZOOM = 15;
const SELECTED_COLOR = '#ff5cd0';
/** Zoom per una camera scelta da Explorer: contesto urbano, mai oltre la mappa base. */
const FOCUS_ZOOM = 11;

interface View {
  bounds: Bounds;
  zoom: number;
}

function viewOf(map: L.Map): View {
  const b = map.getBounds();
  return {
    bounds: { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
    zoom: map.getZoom(),
  };
}

function clusterIcon(count: number, hasLive: boolean): L.DivIcon {
  const size = count >= 100 ? 38 : count >= 10 ? 32 : 26;
  // Solo numeri nell'HTML: nessun testo proveniente dal catalogo.
  const dot = hasLive
    ? `<span style="position:absolute;top:-1px;right:-1px;width:9px;height:9px;border-radius:9999px;background:${CAM_LIVE_COLOR};border:1.5px solid #0b1020"></span>`
    : '';
  const html = `<div style="
      position:relative;
      width:${size}px;height:${size}px;display:grid;place-items:center;
      border-radius:9999px;border:1.5px solid ${CAM_COLOR};
      background:rgba(11,16,32,0.85);box-shadow:0 0 10px ${CAM_COLOR}88;
      color:#ede9fe;font:600 11px ui-monospace,monospace;">${Math.floor(count)}${dot}</div>`;
  return L.divIcon({ className: 'er-cam-cluster', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export default function CamLayer() {
  const map = useMap();
  const { t, language } = useTranslation();
  const selected = useLayersStore((s) => s.selectedCam);
  const setSelected = useLayersStore((s) => s.setSelectedCam);
  const camFocus = useLayersStore((s) => s.camFocus);
  const { cams: allCams } = useCamCatalog(true);
  const typeFilter = useLayersStore((s) => s.camTypeFilter);
  const cams = useMemo(() => filterByType(allCams, typeFilter), [allCams, typeFilter]);
  const [view, setView] = useState<View>(() => viewOf(map));
  // Un solo renderer canvas per tutti i punti CAM.
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);

  useMapEvents({
    moveend: () => setView(viewOf(map)),
    zoomend: () => setView(viewOf(map)),
  });

  // Camera scelta da CAM Explorer: centra mantenendo il contesto geografico.
  useEffect(() => {
    if (!camFocus) return;
    const zoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), FOCUS_ZOOM));
    map.flyTo([camFocus.lat, camFocus.lon], zoom, { duration: 0.8 });
  }, [camFocus, map]);

  const selectedKey = selected ? camKey(selected.source, selected.id) : null;
  const selectedCam = useMemo(
    () => (selectedKey ? (allCams.find((c) => camKey(c.source, c.id) === selectedKey) ?? null) : null),
    [allCams, selectedKey],
  );

  const items = useMemo<GridItem<Cam>[]>(() => {
    if (cams.length === 0) return [];
    const area = padBounds(view.bounds, 0.2);
    const visible = cams.filter((c) => inBounds(c, area));
    if (view.zoom >= Math.min(NO_CLUSTER_ZOOM, map.getMaxZoom())) {
      return visible
        .slice(0, CAM_2D_MAX_ITEMS)
        .map((c) => ({ kind: 'single' as const, lat: c.lat, lon: c.lon, point: c }));
    }
    return gridCluster(
      visible,
      (c) => {
        const p = map.project([c.lat, c.lon], view.zoom);
        return [Math.floor(p.x / CELL_PX), Math.floor(p.y / CELL_PX)];
      },
      CAM_2D_MAX_ITEMS,
      (c) => c.type === 'live',
    );
  }, [cams, view, map]);

  const onClusterClick = (item: Extract<GridItem<Cam>, { kind: 'cluster' }>) => {
    const { south, west, north, east } = item.bounds;
    const b = L.latLngBounds([
      [south, west],
      [north, east],
    ]);
    const maxZoom = Math.min(NO_CLUSTER_ZOOM, map.getMaxZoom());
    const target = Math.min(maxZoom, map.getBoundsZoom(b, false, L.point(80, 80)));
    if (target > map.getZoom()) {
      map.flyToBounds(b, { padding: [40, 40], maxZoom, duration: 0.6 });
      return;
    }
    // Più vicino non si può: l'elenco è il modo giusto per scegliere.
    map.panTo([item.lat, item.lon]);
    useLayersStore.getState().setCamExplorerMode('near');
    useLayersStore.getState().setCamExplorerOpen(true);
  };

  return (
    <>
      {items.map((item) =>
        item.kind === 'cluster' ? (
          <Marker
            key={`c:${item.key}`}
            position={[item.lat, item.lon]}
            icon={clusterIcon(item.count, item.flagged > 0)}
            keyboard={false}
            eventHandlers={{ click: () => onClusterClick(item) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {t('cam.cluster', { count: item.count })}
            </Tooltip>
          </Marker>
        ) : (
          <SingleCam
            key={camKey(item.point.source, item.point.id)}
            cam={item.point}
            selected={selectedKey === camKey(item.point.source, item.point.id)}
            renderer={renderer}
            regionLabel={CAM_SOURCES[item.point.source].region[language]}
            onSelect={() => setSelected({ source: item.point.source, id: item.point.id })}
          />
        ),
      )}
      {selectedCam && (
        <SingleCam
          key={`sel:${selectedKey}`}
          cam={selectedCam}
          selected
          renderer={renderer}
          regionLabel={CAM_SOURCES[selectedCam.source].region[language]}
          onSelect={() => {}}
        />
      )}
    </>
  );
}

interface SingleProps {
  cam: Cam;
  selected: boolean;
  renderer: L.Renderer;
  regionLabel: string;
  onSelect: () => void;
}

function SingleCam({ cam, selected, renderer, regionLabel, onSelect }: SingleProps) {
  const { t } = useTranslation();
  const isLive = cam.type === 'live';
  // LIVE: piccolo punto rosso pieno; SNAP: indicatore CAM viola esistente.
  const fill = isLive ? CAM_LIVE_COLOR : CAM_COLOR;
  const color = selected ? SELECTED_COLOR : fill;
  return (
    <CircleMarker
      center={[cam.lat, cam.lon]}
      radius={selected ? 8 : isLive ? 5 : 6}
      pathOptions={{
        renderer,
        color,
        weight: selected ? 2.4 : 1.4,
        fillColor: fill,
        fillOpacity: isLive ? 0.85 : 0.55,
      }}
      eventHandlers={{ click: onSelect }}
    >
      <Tooltip direction="top" offset={[0, -6]}>
        <div className="text-[11px] leading-tight">
          <div className="font-semibold">📷 {cam.name}</div>
          <div className="font-mono text-space-300">
            {isLive ? t('cam.rowLive') : t('cam.snap')} · {regionLabel}
          </div>
        </div>
      </Tooltip>
    </CircleMarker>
  );
}
