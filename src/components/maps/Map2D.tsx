import { useEffect, useRef, type ReactNode } from 'react';
import { MapContainer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SatelliteTileLayer from './SatelliteTileLayer';
import TerminatorOverlay from '@/components/overlays/TerminatorOverlay';
import { useLayersStore } from '@/store/layersStore';

interface Props {
  /** Centro iniziale [lat, lon]. Default Reggio Emilia (omaggio al progetto originale). */
  initialCenter?: [number, number];
  initialZoom?: number;
  height?: number | string;
  /** ref esposta al parent per controllare la mappa (es. fly-to). */
  mapRef?: React.MutableRefObject<L.Map | null>;
  /** Children renderizzati dentro il MapContainer (overlay leaflet). */
  children?: ReactNode;
}

function MapRefBridge({ mapRef }: { mapRef?: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  const setMapCenter = useLayersStore((s) => s.setMapCenter);
  useEffect(() => {
    if (mapRef) mapRef.current = map;
    // Forza un invalidateSize all'inizio: utile dentro layout flex/grid.
    setTimeout(() => map.invalidateSize(), 50);
    // Inizializza il centro nello store al mount.
    const c = map.getCenter();
    setMapCenter([c.lat, c.lng]);
  }, [map, mapRef, setMapCenter]);
  // Aggiorna lo store ad ogni moveend / zoomend.
  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      setMapCenter([c.lat, c.lng]);
    },
    zoomend: () => {
      const c = map.getCenter();
      setMapCenter([c.lat, c.lng]);
    },
  });
  return null;
}

export default function Map2D({
  initialCenter = [44.698, 10.631],
  initialZoom = 3,
  height = '100%',
  mapRef,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-space-500/30"
      style={{ height }}
    >
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        worldCopyJump
        scrollWheelZoom
        zoomControl={false}
        className="absolute inset-0"
      >
        <SatelliteTileLayer />
        <TerminatorOverlay />
        <ZoomControl position="bottomright" />
        <MapRefBridge mapRef={mapRef} />
        {children}
      </MapContainer>
    </div>
  );
}
