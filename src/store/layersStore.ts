import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_GROUPS, type CelestrakGroup } from '@/services/celestrakGroups';
import type { FirmsDayRange, FirmsSource } from '@/services/firmsApi';
import { isValidLatLon, isValidLatLngTuple } from '@/utils/coords';

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

export interface LayerSettings {
  enabled: boolean;
  opacity: number; // 0..1
}

/** Alias pubblico per i consumer (es. buildShareUrl). */
export type LayerSnapshot = LayerSettings;

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

/** Cella meteo selezionata: direzione cardinale relativa al centro. */
export interface SelectedWeatherCell {
  direction: 'CENTER' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
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

  /** Distanza in km tra centro mappa e celle meteo direzionali. */
  weatherGridStepKm: number;
  /** Cella meteo selezionata. */
  selectedWeatherCell: SelectedWeatherCell | null;
  /** Centro mappa corrente [lat, lon]. Transiente (non persistito).
   *  Aggiornato da un piccolo bridge dentro Map2D — letto da WeatherLayer/Panel. */
  mapCenter: [number, number];

  /** Indice del frame radar attualmente mostrato (in `frames.all`). */
  rainRadarFrameIndex: number;
  /** True se l'animazione radar sta riproducendo. */
  rainRadarPlaying: boolean;
  /** Opacità tile radar precipitazioni 0..1 (default 0.7). */
  rainRadarOpacity: number;

  /** Categorie EONET attive (string id). Vuoto = tutte le categorie. */
  eonetActiveCategories: string[];
  /** Range di giorni per il filtro EONET (1..30). */
  eonetDaysRange: number;
  /** ID dell'evento EONET selezionato per il pannello dettaglio. */
  eonetSelectedEventId: string | null;
  /** Mostra solo eventi aperti (`open`) o anche chiusi (`all`). */
  eonetStatus: 'open' | 'all';

  /** Mostra il ground track ±45 min sull'overlay ISS dedicato. */
  issShowGroundTrack: boolean;
  /**
   * Posizione utente per il pass predictor. Null = usa il centro mappa.
   * Opt-in: l'utente può cliccare "usa la mia posizione" per geolocate.
   */
  userLocationForPasses: { lat: number; lon: number } | null;

  /** Sorgente FIRMS attiva (VIIRS Suomi NPP, NOAA-20, MODIS NRT). */
  firesSource: FirmsSource;
  /** Finestra temporale FIRMS (1..7 giorni). */
  firesDayRange: FirmsDayRange;
  /** ID hotspot FIRMS selezionato (composito lat,lon,acqDate,acqTime). */
  selectedFireId: string | null;

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

  /** Setter per la sezione meteo. */
  setWeatherGridStepKm: (v: number) => void;
  setSelectedWeatherCell: (sel: SelectedWeatherCell | null) => void;
  setMapCenter: (c: [number, number]) => void;
  setRainRadarFrameIndex: (i: number) => void;
  setRainRadarPlaying: (v: boolean) => void;
  setRainRadarOpacity: (v: number) => void;

  /** Setter per le categorie EONET. Vuoto = "tutte". */
  setEonetActiveCategories: (ids: string[]) => void;
  toggleEonetCategory: (id: string) => void;
  /** Range di giorni 1..30 (clampato). */
  setEonetDaysRange: (days: number) => void;
  setEonetSelectedEventId: (id: string | null) => void;
  setEonetStatus: (s: 'open' | 'all') => void;

  setIssShowGroundTrack: (v: boolean) => void;
  setUserLocationForPasses: (loc: { lat: number; lon: number } | null) => void;

  setFiresSource: (s: FirmsSource) => void;
  setFiresDayRange: (d: FirmsDayRange) => void;
  setSelectedFireId: (id: string | null) => void;
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
      weatherGridStepKm: 100,
      selectedWeatherCell: null,
      mapCenter: [44.698, 10.631],
      rainRadarFrameIndex: 0,
      rainRadarPlaying: false,
      rainRadarOpacity: 0.7,
      eonetActiveCategories: [],
      eonetDaysRange: 30,
      eonetSelectedEventId: null,
      eonetStatus: 'open',
      issShowGroundTrack: true,
      userLocationForPasses: null,
      firesSource: 'VIIRS_SNPP_NRT',
      firesDayRange: 1,
      selectedFireId: null,
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
      setWeatherGridStepKm: (weatherGridStepKm) =>
        set({ weatherGridStepKm: Math.max(20, Math.min(500, weatherGridStepKm)) }),
      setSelectedWeatherCell: (selectedWeatherCell) => set({ selectedWeatherCell }),
      // Ignora centri non validi (NaN/undefined/fuori range): mantiene l'ultimo
      // centro valido invece di propagare coordinate rotte a Leaflet.
      setMapCenter: (mapCenter) =>
        set((s) => ({ mapCenter: isValidLatLngTuple(mapCenter) ? mapCenter : s.mapCenter })),
      setRainRadarFrameIndex: (rainRadarFrameIndex) =>
        set({ rainRadarFrameIndex: Math.max(0, rainRadarFrameIndex) }),
      setRainRadarPlaying: (rainRadarPlaying) => set({ rainRadarPlaying }),
      setRainRadarOpacity: (rainRadarOpacity) =>
        set({ rainRadarOpacity: clamp01(rainRadarOpacity) }),
      setEonetActiveCategories: (eonetActiveCategories) =>
        set({ eonetActiveCategories: [...new Set(eonetActiveCategories)] }),
      toggleEonetCategory: (id) =>
        set((s) => ({
          eonetActiveCategories: s.eonetActiveCategories.includes(id)
            ? s.eonetActiveCategories.filter((c) => c !== id)
            : [...s.eonetActiveCategories, id],
        })),
      setEonetDaysRange: (eonetDaysRange) =>
        set({ eonetDaysRange: Math.max(1, Math.min(30, Math.round(eonetDaysRange))) }),
      setEonetSelectedEventId: (eonetSelectedEventId) => set({ eonetSelectedEventId }),
      setEonetStatus: (eonetStatus) => set({ eonetStatus }),
      setIssShowGroundTrack: (issShowGroundTrack) => set({ issShowGroundTrack }),
      // Accetta solo coordinate valide oppure null (reset). Coordinate rotte
      // (GPS negato/scaduto, valori legacy) non entrano mai nello store.
      setUserLocationForPasses: (userLocationForPasses) =>
        set({
          userLocationForPasses:
            userLocationForPasses && isValidLatLon(userLocationForPasses.lat, userLocationForPasses.lon)
              ? userLocationForPasses
              : null,
        }),
      setFiresSource: (firesSource) => set({ firesSource }),
      setFiresDayRange: (firesDayRange) => set({ firesDayRange }),
      setSelectedFireId: (selectedFireId) => set({ selectedFireId }),
    }),
    {
      name: 'earthradar:layers',
      version: 7,
      partialize: (s) => ({
        baseLayer: s.baseLayer,
        overlays: s.overlays,
        satelliteGroups: s.satelliteGroups,
        aircraftShowOnGround: s.aircraftShowOnGround,
        aircraftShowVelocityVectors: s.aircraftShowVelocityVectors,
        weatherGridStepKm: s.weatherGridStepKm,
        rainRadarOpacity: s.rainRadarOpacity,
        eonetActiveCategories: s.eonetActiveCategories,
        eonetDaysRange: s.eonetDaysRange,
        eonetStatus: s.eonetStatus,
        issShowGroundTrack: s.issShowGroundTrack,
        userLocationForPasses: s.userLocationForPasses,
        firesSource: s.firesSource,
        firesDayRange: s.firesDayRange,
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
          weatherGridStepKm: p.weatherGridStepKm ?? current.weatherGridStepKm,
          rainRadarOpacity: p.rainRadarOpacity ?? current.rainRadarOpacity,
          eonetActiveCategories: p.eonetActiveCategories ?? current.eonetActiveCategories,
          eonetDaysRange: p.eonetDaysRange ?? current.eonetDaysRange,
          eonetStatus: p.eonetStatus ?? current.eonetStatus,
          issShowGroundTrack: p.issShowGroundTrack ?? current.issShowGroundTrack,
          // Sanitizza eventuali coordinate legacy non valide da versioni precedenti.
          userLocationForPasses:
            p.userLocationForPasses &&
            isValidLatLon(p.userLocationForPasses.lat, p.userLocationForPasses.lon)
              ? p.userLocationForPasses
              : current.userLocationForPasses,
          firesSource: p.firesSource ?? current.firesSource,
          firesDayRange: p.firesDayRange ?? current.firesDayRange,
        };
      },
    },
  ),
);
