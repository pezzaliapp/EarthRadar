import { useEffect, useRef, type ReactNode } from 'react';
import { MapContainer, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SatelliteTileLayer from './SatelliteTileLayer';
import TerminatorOverlay from '@/components/overlays/TerminatorOverlay';

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
  useEffect(() => {
    if (mapRef) mapRef.current = map;
    // Forza un invalidateSize all'inizio: utile dentro layout flex/grid.
    setTimeout(() => map.invalidateSize(), 50);
  }, [map, mapRef]);
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
