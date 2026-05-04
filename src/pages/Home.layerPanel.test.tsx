import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Regression: PR fix/v1.0.2-globe-layerspanel.
 *
 * Bug v1.0.1: in vista 3D la colonna LayersPanel scompariva. Causa:
 * react-globe.gl (via three-render-objects) usa di default
 * window.innerWidth/innerHeight come dimensioni del canvas. Senza w/h
 * espliciti il canvas (~1920×1080) gonfia la min-content della grid
 * column "1fr" della Home, spingendo la colonna LayersPanel (320px) fuori
 * viewport. Il fix passa width/height misurati al `<Globe>` e indurisce
 * la grid con min-w-0 / minmax(0,1fr).
 *
 * Strategia di test
 * - `Globe3D` viene stubbato a un div leggero (jsdom non ha WebGL).
 * - I layer overlay sono lazy-loaded e non vengono toccati dalla suite.
 * - Smoke su DOM: il LayersPanel deve esistere in entrambe le viewMode.
 * - Persistenza store: un toggle in 2D rimane attivo dopo il passaggio a 3D.
 */
vi.mock('@/components/maps/Globe3D', () => ({
  default: () => <div data-testid="globe3d-stub" />,
}));

// Map2D usa Leaflet, che crasha in jsdom (operazioni DOM su nodi nulli).
// Questo test guarda al LayersPanel, non alla mappa: stub leggero.
vi.mock('@/components/maps/Map2D', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map2d-stub">{children}</div>
  ),
}));

// I service che fanno fetch reali al mount restituiscono fallback statici;
// non c'è bisogno di mock. Resettiamo solo localStorage per isolare lo store
// persist tra i test.

import App from '@/App';
import { useSettingsStore } from '@/store/settingsStore';
import { useLayersStore } from '@/store/layersStore';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Home — LayersPanel parità 2D/3D (regressione v1.0.2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Riporta gli store al default tra un test e l'altro (persist invalido
    // dopo localStorage.clear, ma il singleton in memoria sopravvive).
    // Forziamo language='it' perché il navigator jsdom default è 'en' e i
    // selettori di questo file sono in italiano.
    act(() => {
      useSettingsStore.setState({ viewMode: '2d', language: 'it' });
      useLayersStore.setState({
        overlays: { ...useLayersStore.getState().overlays, satellites: { enabled: false, opacity: 1 } },
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('mostra il LayersPanel in viewMode 2d', async () => {
    act(() => useSettingsStore.setState({ viewMode: '2d' }));
    renderHome();
    // Il <h2> "Layer" del pannello convive con la voce nav "Layer";
    // identifichiamo il pannello dal suo aria-label = "Layer".
    const panels = await screen.findAllByLabelText('Layer');
    const aside = panels.find((el) => el.tagName.toLowerCase() === 'aside');
    expect(aside).toBeTruthy();
    // Sotto-elementi caratteristici del pannello: legend "Mappa base".
    expect(screen.getByText('Mappa base')).toBeInTheDocument();
  });

  it('mostra il LayersPanel anche in viewMode 3d (era questo il bug)', async () => {
    act(() => useSettingsStore.setState({ viewMode: '3d' }));
    renderHome();
    expect(await screen.findByTestId('globe3d-stub')).toBeInTheDocument();
    const panels = await screen.findAllByLabelText('Layer');
    const aside = panels.find((el) => el.tagName.toLowerCase() === 'aside');
    expect(aside).toBeTruthy();
    expect(screen.getByText('Mappa base')).toBeInTheDocument();
  });

  it('preserva i toggle dei layer quando si commuta da 2D a 3D', async () => {
    act(() => useSettingsStore.setState({ viewMode: '2d' }));
    const { rerender } = renderHome();
    await screen.findByText('Mappa base');

    // Toggle layer "satelliti" via store (più stabile che cliccare il bottone
    // nidificato — qui ci interessa la persistenza, non la UX del click).
    act(() => useLayersStore.getState().setOverlayEnabled('satellites', true));
    expect(useLayersStore.getState().overlays.satellites?.enabled).toBe(true);

    // Switch in 3D.
    act(() => useSettingsStore.setState({ viewMode: '3d' }));
    rerender(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('globe3d-stub')).toBeInTheDocument());
    // Il pannello esiste in 3D…
    const panels = await screen.findAllByLabelText('Layer');
    expect(panels.find((el) => el.tagName.toLowerCase() === 'aside')).toBeTruthy();
    // …e lo stato del layer toggleato in 2D è rimasto attivo (Zustand persist).
    expect(useLayersStore.getState().overlays.satellites?.enabled).toBe(true);
  });
});
