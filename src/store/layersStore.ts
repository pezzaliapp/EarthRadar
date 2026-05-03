import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_GROUPS, type CelestrakGroup } from '@/services/celestrakGroups';

/**
 * Identificatori dei layer dati. I layer GIBS usano gli stessi id di gibsLayers.ts.
 * I layer "data" arriveranno via service nelle fasi 1+ (quakes, satellites, aircraft, …).
 */
export type LayerId =
  // Base mappa (commutabili dal layer panel)
  | 'gibs_modis_truecolor'
  | 'gibs_viirs_truecolor'
  | 'gibs_blackmarble'
  | 'gibs_clouds_geocolor'
  | 'osm'
  // Overlay GIBS
  | 'gibs_temperature'
  | 'gibs_aerosol'
  | 'gibs_fires'
  | 'gibs_snow'
  | 'gibs_seaice'
  // Layer dati / vector overlay
  | 'quakes'
  | 'satellites'
  | 'aircraft'
  | 'weather'
  | 'firms'
  | 'eonet'
  | 'iss'
  | 'lightning'
  // Overlay non-tile
  | 'terminator'
  | 'rainviewer';

interface LayerSettings {
  enabled: boolean;
  opacity: number; // 0..1
}

/** Identificazione del satellite selezionato (per il pannello dettaglio). */
export interface SelectedSatellite {
  noradId: number;
  name: string;
}

/** Identificazione dell'aereo selezionato (per il pannello dettaglio). */
export interface SelectedAircraft {
  icao24: string;
  callsign: string;
}

interface LayersState {
  /** Layer base mappa attivo (esattamente uno). */
  baseLayer: LayerId;
  /** Stato per-layer (overlay e dati). Non include il base. */
  overlays: Record<LayerId, LayerSettings>;
  /** Gruppi CelesTrak da scaricare quando il layer "satellites" è attivo. */
  satelliteGroups: CelestrakGroup[];
  /** Satellite selezionato per il pannello dettaglio. */
  selectedSatellite: SelectedSatellite | null;

  /** Mostra anche gli aerei a terra (default false). */
  aircraftShowOnGround: boolean;
  /** Mostra il vettore velocità (proiezione 30 s). */
  aircraftShowVelocityVectors: boolean;
  /** Aereo selezionato per il pannello dettaglio. */
  selectedAircraft: SelectedAircraft | null;

  /** Aggiorna il layer base mappa. */
  setBaseLayer: (id: LayerId) => void;
  /** Mostra/nasconde un overlay. */
  toggleOverlay: (id: LayerId) => void;
  setOverlayEnabled: (id: LayerId, enabled: boolean) => void;
  /** Imposta opacity 0..1 (clampata). */
  setOpacity: (id: LayerId, opacity: number) => void;
  /** True se il layer è attivo (base o overlay enabled). */
  isActive: (id: LayerId) => boolean;

  /** Aggiunge / rimuove / imposta i gruppi CelesTrak attivi. */
  toggleSatelliteGroup: (group: CelestrakGroup) => void;
  setSatelliteGroups: (groups: CelestrakGroup[]) => void;
  /** Seleziona / deseleziona il satellite mostrato nel pannello dettaglio. */
  setSelectedSatellite: (sel: SelectedSatellite | null) => void;

  /** Toggles per la sezione aerei. */
  setAircraftShowOnGround: (v: boolean) => void;
  setAircraftShowVelocityVectors: (v: boolean) => void;
  /** Seleziona / deseleziona l'aereo mostrato nel pannello dettaglio. */
  setSelectedAircraft: (sel: SelectedAircraft | null) => void;
}

const DEFAULT_OPACITY = 0.85;

function ov(enabled = false, opacity = DEFAULT_OPACITY): LayerSettings {
  return { enabled, opacity };
}

const DEFAULT_OVERLAYS: Record<LayerId, LayerSettings> = {
  gibs_modis_truecolor: ov(),
  gibs_viirs_truecolor: ov(),
  gibs_blackmarble: ov(),
  gibs_clouds_geocolor: ov(false, 0.7),
  osm: ov(),
  gibs_temperature: ov(false, 0.6),
  gibs_aerosol: ov(false, 0.6),
  gibs_fires: ov(false, 0.85),
  gibs_snow: ov(false, 0.7),
  gibs_seaice: ov(false, 0.7),
  quakes: ov(true, 1),
  satellites: ov(false, 1),
  aircraft: ov(false, 1),
  weather: ov(false, 1),
  firms: ov(false, 1),
  eonet: ov(false, 1),
  iss: ov(false, 1),
  lightning: ov(false, 1),
  terminator: ov(true, 0.6),
  rainviewer: ov(false, 0.6),
};

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export const useLayersStore = create<LayersState>()(
  persist(
    (set, get) => ({
      baseLayer: 'gibs_viirs_truecolor',
      overlays: DEFAULT_OVERLAYS,
      satelliteGroups: [...DEFAULT_GROUPS],
      selectedSatellite: null,
      aircraftShowOnGround: false,
      aircraftShowVelocityVectors: true,
      selectedAircraft: null,
      setBaseLayer: (baseLayer) => set({ baseLayer }),
      toggleOverlay: (id) =>
        set((s) => ({
          overlays: {
            ...s.overlays,
            [id]: { ...s.overlays[id], enabled: !s.overlays[id]?.enabled },
          },
        })),
      setOverlayEnabled: (id, enabled) =>
        set((s) => ({
          overlays: { ...s.overlays, [id]: { ...s.overlays[id], enabled } },
        })),
      setOpacity: (id, opacity) =>
        set((s) => ({
          overlays: {
            ...s.overlays,
            [id]: { ...s.overlays[id], opacity: clamp01(opacity) },
          },
        })),
      isActive: (id) => {
        const s = get();
        return s.baseLayer === id || s.overlays[id]?.enabled === true;
      },
      toggleSatelliteGroup: (group) =>
        set((s) => ({
          satelliteGroups: s.satelliteGroups.includes(group)
            ? s.satelliteGroups.filter((g) => g !== group)
            : [...s.satelliteGroups, group],
        })),
      setSatelliteGroups: (groups) => set({ satelliteGroups: [...groups] }),
      setSelectedSatellite: (selectedSatellite) => set({ selectedSatellite }),
      setAircraftShowOnGround: (aircraftShowOnGround) => set({ aircraftShowOnGround }),
      setAircraftShowVelocityVectors: (aircraftShowVelocityVectors) =>
        set({ aircraftShowVelocityVectors }),
      setSelectedAircraft: (selectedAircraft) => set({ selectedAircraft }),
    }),
    {
      name: 'earthradar:layers',
      version: 3,
      partialize: (s) => ({
        baseLayer: s.baseLayer,
        overlays: s.overlays,
        satelliteGroups: s.satelliteGroups,
        aircraftShowOnGround: s.aircraftShowOnGround,
        aircraftShowVelocityVectors: s.aircraftShowVelocityVectors,
      }),
      // Merge per non perdere nuovi layer aggiunti in versioni successive del codice.
      merge: (persisted, current) => {
        const p = (persisted as Partial<LayersState>) ?? {};
        return {
          ...current,
          baseLayer: p.baseLayer ?? current.baseLayer,
          overlays: { ...current.overlays, ...(p.overlays ?? {}) },
          satelliteGroups: p.satelliteGroups ?? current.satelliteGroups,
          aircraftShowOnGround: p.aircraftShowOnGround ?? current.aircraftShowOnGround,
          aircraftShowVelocityVectors:
            p.aircraftShowVelocityVectors ?? current.aircraftShowVelocityVectors,
        };
      },
    },
  ),
);
