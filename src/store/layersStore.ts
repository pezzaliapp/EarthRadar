import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface LayersState {
  /** Layer base mappa attivo (esattamente uno). */
  baseLayer: LayerId;
  /** Stato per-layer (overlay e dati). Non include il base. */
  overlays: Record<LayerId, LayerSettings>;
  /** Aggiorna il layer base mappa. */
  setBaseLayer: (id: LayerId) => void;
  /** Mostra/nasconde un overlay. */
  toggleOverlay: (id: LayerId) => void;
  setOverlayEnabled: (id: LayerId, enabled: boolean) => void;
  /** Imposta opacity 0..1 (clampata). */
  setOpacity: (id: LayerId, opacity: number) => void;
  /** True se il layer è attivo (base o overlay enabled). */
  isActive: (id: LayerId) => boolean;
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
    }),
    {
      name: 'earthradar:layers',
      version: 1,
      partialize: (s) => ({ baseLayer: s.baseLayer, overlays: s.overlays }),
      // Merge per non perdere nuovi layer aggiunti in versioni successive del codice.
      merge: (persisted, current) => {
        const p = (persisted as Partial<LayersState>) ?? {};
        return {
          ...current,
          baseLayer: p.baseLayer ?? current.baseLayer,
          overlays: { ...current.overlays, ...(p.overlays ?? {}) },
        };
      },
    },
  ),
);
