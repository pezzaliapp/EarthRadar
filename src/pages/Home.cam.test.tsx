import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { __resetCamCatalogForTests } from '@/services/camCatalog';

/**
 * CAM OFF deve equivalere a "CAM non esiste": nessuna richiesta verso il
 * catalogo né verso gli host delle immagini. CAM ON scarica solo il catalogo
 * same-origin (nessuna immagine finché non si apre una camera).
 */

const CAM_HOSTS = /jamcams\.tfl\.gov\.uk|weathercam\.digitraffic\.fi|tdcctv\.data\.one\.gov\.hk|wzmedia\.dot\.ca\.gov|cwwp2\.dot\.ca\.gov|iowadot\.gov|garr\.tv/;

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input) return String((input as Request).url);
  return String(input);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetCamCatalogForTests();
  // Vista 3D: in jsdom Leaflet non ha né SVG né canvas (il 2D va in errore anche
  // senza CAM); la Home 3D monta invece LayerPanel + Globe3D (che usa lo stesso
  // hook di catalogo della 2D).
  useSettingsStore.getState().setViewMode('3d');
  useSettingsStore.getState().setLanguage('it');
  fetchMock = vi.fn(async (input: unknown) => {
    if (urlOf(input).includes('/cam/')) {
      return new Response(
        JSON.stringify({ v: 2, hash: 'h', cams: [['hktd', 'H429F', 22.24, 114.15, 'Aberdeen', 'S']] }),
        { status: 200 },
      );
    }
    // Tutti gli altri layer: rete non disponibile (i loro fallback restano invariati).
    throw new TypeError('network disabled in test');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  useLayersStore.getState().setCamEnabled(false);
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function camRequests(): string[] {
  return fetchMock.mock.calls.map((c) => urlOf(c[0])).filter((u) => u.includes('/cam/') || CAM_HOSTS.test(u));
}

describe('Home — layer CAM', () => {
  it('CAM OFF di default → zero richieste CAM e nessuna immagine CAM', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    // Home è lazy: attende che il LayerPanel (con la riga CAM) sia montato.
    await screen.findByLabelText(/Webcam \(CAM\)/, undefined, { timeout: 5000 });
    expect(useLayersStore.getState().overlays.cam.enabled).toBe(false);
    await new Promise((r) => setTimeout(r, 100));
    expect(camRequests()).toEqual([]);
    for (const img of document.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').not.toMatch(CAM_HOSTS);
    }
  });

  it('CAM ON dal LayerPanel → solo il catalogo same-origin, nessuna preview precaricata', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText(/Webcam \(CAM\)/, undefined, { timeout: 5000 }));
    expect(useLayersStore.getState().overlays.cam.enabled).toBe(true);
    await waitFor(() => expect(camRequests()).toEqual(['/EarthRadar/cam/cams-v2.json']));
    await waitFor(() => expect(screen.getByText('1 camere')).toBeInTheDocument());
    expect(camRequests().filter((u) => CAM_HOSTS.test(u))).toEqual([]);
    for (const img of document.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').not.toMatch(CAM_HOSTS);
    }
  });

  it('callout "NEW · 📷 CAM": nuovo testo senza numeri, senza scaricare nulla', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    const cta = await screen.findByRole('button', { name: /Apri CAM Explorer: video LIVE e immagini pubbliche/ }, { timeout: 5000 });
    expect(cta.textContent).toContain('NEW · 📷 CAM');
    expect(cta.textContent).toContain('LIVE e immagini pubbliche dalla rete globale.');
    expect(cta.textContent).not.toMatch(/\d/);
    expect(camRequests()).toEqual([]);
  });

  it('callout: attiva CAM, apre CAM Explorer e carica solo il catalogo; al reload CAM torna OFF', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Apri CAM Explorer/ }, { timeout: 5000 }));
    const s = useLayersStore.getState();
    expect(s.overlays.cam.enabled).toBe(true);
    expect(s.camExplorerOpen).toBe(true);
    // Viewport stretto (jsdom): Explorer come pannello dal basso.
    expect(await screen.findByRole('dialog', { name: 'CAM Explorer' })).toBeInTheDocument();
    await waitFor(() => expect(camRequests()).toEqual(['/EarthRadar/cam/cams-v2.json']));
    // Stato salvato: CAM OFF ed Explorer non persistito.
    const saved = JSON.parse(window.localStorage.getItem('earthradar:layers') ?? '{}');
    expect(saved.state.overlays.cam.enabled).toBe(false);
    expect(JSON.stringify(saved)).not.toContain('camExplorerOpen');
  });

  it('la riga informativa della Home cita le webcam pubbliche', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/webcam pubbliche \(CAM\)/, undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});
