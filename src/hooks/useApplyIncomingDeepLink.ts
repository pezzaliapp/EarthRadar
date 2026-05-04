import { useEffect } from 'react';
import {
  parseIncomingShareUrl,
  type IncomingDeepLink,
  type ShareableLayerId,
} from '@/lib/deepLinkBuilder';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Applica al boot il deep link entrante: legge una sola volta `location.search`,
 * setta lo stato (layer, view, centro mappa) e ripulisce la query string per
 * evitare ri-applicazioni a refresh successivi.
 *
 * Pure side-effect logic: la helper {@link applyIncomingDeepLink} è esposta
 * per i test (jsdom).
 */

export interface ApplyTargets {
  setOverlayEnabled: (id: ShareableLayerId, enabled: boolean) => void;
  setViewMode: (mode: '2d' | '3d') => void;
  setMapCenter: (c: [number, number]) => void;
  setSelectedSatelliteByNorad?: (norad: number) => void;
}

/**
 * Esegue gli effetti del deep link contro i target iniettati. Pure: non
 * tocca window/history. Esposta per i test e per il consumer hook.
 */
export function applyIncomingDeepLink(
  link: IncomingDeepLink,
  targets: ApplyTargets,
): void {
  if (link.view) targets.setViewMode(link.view);
  if (link.center) targets.setMapCenter([link.center.lat, link.center.lon]);

  if (link.activeLayers) {
    for (const id of link.activeLayers) targets.setOverlayEnabled(id, true);
  }
  if (link.focusLayer) targets.setOverlayEnabled(link.focusLayer, true);

  if (link.norad !== undefined && targets.setSelectedSatelliteByNorad) {
    targets.setSelectedSatelliteByNorad(link.norad);
  }
}

export function useApplyIncomingDeepLink(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = window.location.search;
    if (!search || search === '?') return;

    const link = parseIncomingShareUrl(search);
    const layersStore = useLayersStore.getState();
    const settingsStore = useSettingsStore.getState();

    applyIncomingDeepLink(link, {
      setOverlayEnabled: (id, enabled) =>
        layersStore.setOverlayEnabled(id as Parameters<typeof layersStore.setOverlayEnabled>[0], enabled),
      setViewMode: settingsStore.setViewMode,
      setMapCenter: layersStore.setMapCenter,
      // norad → selezione satellite: il SatelliteLayer farà il resolve
      // quando la lista TLE arriva. Per ora segniamo solo l'attivazione
      // del layer satelliti (già gestita da focusLayer/activeLayers).
    });

    // Pulizia: rimuovi i query params per non riapplicare al refresh.
    // history.replaceState evita reload e mantiene la pathname corrente.
    if (window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState(null, '', url.toString());
    }
    // Gli store sono singoton: leggiamo getState() in mount, niente deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
