import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLayersStore } from './layersStore';

/**
 * Guard delle coordinate nello store: nessuna coordinata rotta (GPS negato,
 * scaduto, NaN, fuori range, valore legacy) deve entrare nello stato e da lì
 * raggiungere Leaflet.
 */
const DEFAULT_CENTER: [number, number] = [44.698, 10.631];

beforeEach(() => {
  useLayersStore.getState().setMapCenter(DEFAULT_CENTER);
  useLayersStore.getState().setUserLocationForPasses(null);
});
afterEach(() => {
  useLayersStore.getState().setMapCenter(DEFAULT_CENTER);
  useLayersStore.getState().setUserLocationForPasses(null);
});

describe('setMapCenter', () => {
  it('accetta un centro valido', () => {
    useLayersStore.getState().setMapCenter([40, 15]);
    expect(useLayersStore.getState().mapCenter).toEqual([40, 15]);
  });

  it('ignora NaN e mantiene l’ultimo centro valido', () => {
    useLayersStore.getState().setMapCenter([40, 15]);
    useLayersStore.getState().setMapCenter([NaN, NaN]);
    expect(useLayersStore.getState().mapCenter).toEqual([40, 15]);
  });

  it('ignora coordinate fuori range', () => {
    useLayersStore.getState().setMapCenter([40, 15]);
    useLayersStore.getState().setMapCenter([200, 15]);
    expect(useLayersStore.getState().mapCenter).toEqual([40, 15]);
  });
});

describe('setUserLocationForPasses (geolocalizzazione)', () => {
  it('accetta coordinate GPS valide', () => {
    useLayersStore.getState().setUserLocationForPasses({ lat: 45.1, lon: 9.2 });
    expect(useLayersStore.getState().userLocationForPasses).toEqual({ lat: 45.1, lon: 9.2 });
  });

  it('scarta coordinate NaN (Safari/iOS senza fix immediato) → null', () => {
    useLayersStore.getState().setUserLocationForPasses({ lat: NaN, lon: NaN });
    expect(useLayersStore.getState().userLocationForPasses).toBeNull();
  });

  it('scarta coordinate fuori range → null', () => {
    useLayersStore.getState().setUserLocationForPasses({ lat: 999, lon: 9 });
    expect(useLayersStore.getState().userLocationForPasses).toBeNull();
  });

  it('accetta null come reset (permesso negato)', () => {
    useLayersStore.getState().setUserLocationForPasses({ lat: 45, lon: 9 });
    useLayersStore.getState().setUserLocationForPasses(null);
    expect(useLayersStore.getState().userLocationForPasses).toBeNull();
  });
});
