import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCamCatalog, type Cam } from '@/services/camCatalog';
import { CAM_SOURCES, camImageUrl, camStreamUrl } from '@/services/camSources';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hasActiveLive, stopActiveLive } from '@/lib/livePlayer';
import meta from '@/services/camCatalogMeta.json';

/** Fonti italiane GARR.tv (INGV-OE, CNR-ISMAR) dentro l'architettura CAM LIVE esistente. */

const catalog = parseCamCatalog(
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../public/cam/cams-v2.json'), 'utf8')),
);
vi.mock('@/hooks/useCamCatalog', () => ({
  useCamCatalog: () => ({ cams: catalog.cams, source: 'fresh', loading: false, error: null, fetchedAt: 0 }),
}));
const hlsImport = vi.hoisted(() => ({ count: 0 }));
vi.mock('hls.js/light', () => {
  hlsImport.count++;
  class FakeHls {
    static Events = { ERROR: 'e', MANIFEST_PARSED: 'm' };
    static ErrorTypes = { NETWORK_ERROR: 'n', MEDIA_ERROR: 'md' };
    static isSupported = () => true;
    loadSource = vi.fn();
    attachMedia = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    on() {}
  }
  return { default: FakeHls };
});

import CamExplorer from './CamExplorer';
import { CamLiveBody } from './CamCard';

const ETNA_UUID = 'c6c70a03-e711-4eed-9835-1d02f5a5ec58';
const EOLIE_UUID = '8790a7a8-211c-4794-bcb2-41e24cd2e322';
const etna = catalog.cams.find((c) => c.id === ETNA_UUID) as Cam;
const eolie = catalog.cams.find((c) => c.id === EOLIE_UUID) as Cam;
const rowsEls = () => [...document.querySelectorAll('[role="listitem"]')] as HTMLElement[];
const listTotal = () => Number((document.querySelector('[data-total]') as HTMLElement).dataset.total);

let native = false;
beforeEach(() => {
  hlsImport.count = 0;
  native = false;
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => (native ? 'maybe' : ''));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  useSettingsStore.setState({ language: 'it' });
  useLayersStore.setState({
    camExplorerOpen: true,
    camExplorerMode: 'areas',
    camTypeFilter: 'all',
    selectedCam: null,
    camFocus: null,
    mapCenter: [44.698, 10.631],
  });
});
afterEach(() => {
  cleanup();
  stopActiveLive();
  vi.restoreAllMocks();
});

describe('catalogo — INGV e CNR-ISMAR', () => {
  it('Etna ed Eolie presenti come LIVE INGV, posizionate su Etna e Isole Eolie', () => {
    expect(etna).toMatchObject({ source: 'ingv', type: 'live', stream: ETNA_UUID });
    expect(eolie).toMatchObject({ source: 'ingv', type: 'live', stream: EOLIE_UUID });
    expect(etna.lat).toBeCloseTo(37.75, 1);
    expect(etna.lon).toBeCloseTo(14.99, 1);
    expect(eolie.lat).toBeGreaterThan(38.3);
    expect(eolie.lat).toBeLessThan(38.9);
    expect(camStreamUrl('ingv', etna.stream)).toBe(
      `https://garr.tv/static/streaming-playlists/hls/${ETNA_UUID}/master.m3u8`,
    );
  });

  it('solo camere CNR-ISMAR verificate alla build; posizionate nel Golfo di Venezia', () => {
    const cnr = catalog.cams.filter((c) => c.source === 'cnrismar');
    expect(cnr.length).toBe((meta.counts as Record<string, number>).cnrismar ?? 0);
    expect(cnr.length).toBeLessThanOrEqual(4);
    for (const c of cnr) {
      expect(c.type).toBe('live');
      expect(c.lat).toBeGreaterThan(45.2);
      expect(c.lat).toBeLessThan(45.5);
    }
  });

  it('nessuna regressione: SNAP 2.629, Caltrans e Iowa invariati', () => {
    const counts = meta.counts as Record<string, number>;
    expect(meta.kinds.snap).toBe(2629);
    expect(catalog.cams.filter((c) => c.source === 'caltrans')).toHaveLength(counts.caltrans);
    expect(catalog.cams.filter((c) => c.source === 'iowa')).toHaveLength(counts.iowa);
    expect(counts.caltrans).toBeGreaterThan(1000);
    expect(counts.iowa).toBeGreaterThan(500);
  });
});

describe('CAM Explorer — Italia (data-driven)', () => {
  it('area "Italia" generata dai dati, con Etna ed Eolie', () => {
    render(<CamExplorer variant="sidebar" />);
    fireEvent.click(screen.getByText('Italia'));
    const text = rowsEls().map((r) => r.textContent).join(' ');
    expect(text).toContain('Etna');
    expect(text).toContain('Eolie');
  });

  it('con filtro LIVE l’area Italia resta, insieme a California e Iowa', () => {
    render(<CamExplorer variant="sidebar" />);
    fireEvent.click(screen.getByRole('radio', { name: /LIVE/ }));
    const areas = within(screen.getByRole('list', { name: 'Aree' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(areas.some((a) => a?.includes('Italia'))).toBe(true);
    expect(areas.some((a) => a?.includes('California, USA'))).toBe(true);
    expect(areas.some((a) => a?.includes('Iowa, USA'))).toBe(true);
  });

  it('ricerca "Etna" e "Eolie"', () => {
    useLayersStore.setState({ camExplorerMode: 'search' });
    render(<CamExplorer variant="sidebar" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Etna' } });
    expect(rowsEls()[0].textContent).toContain('Etna');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'eolie' } });
    expect(rowsEls()[0].textContent).toContain('Eolie');
  });

  it('Zona mappa sull’Italia + LIVE: prime le camere italiane; miniature neutre, nessuna immagine', () => {
    useLayersStore.setState({ camExplorerMode: 'near', camTypeFilter: 'live', mapCenter: [37.5, 15.08] });
    render(<CamExplorer variant="sidebar" />);
    expect(listTotal()).toBe(meta.kinds.live);
    expect(rowsEls()[0].textContent).toContain('Etna');
    expect(rowsEls()[1].textContent).toContain('Eolie');
    expect(rowsEls()[0].querySelector('[data-testid="thumb-no-image"]')).not.toBeNull();
    expect(document.querySelectorAll('video')).toHaveLength(0);
  });
});

describe('CamCard — INGV Etna', () => {
  it('attribuzione INGV, GARR.tv, CC BY 4.0 e DOI; nessuna proprietà di EarthRadar', () => {
    render(<CamLiveBody cam={etna} onClose={() => {}} />);
    expect(screen.getByText('INGV – Osservatorio Etneo, Istituto Nazionale di Geofisica e Vulcanologia')).toBeInTheDocument();
    expect(screen.getByText('Video via GARR.tv — licenza CC BY 4.0')).toBeInTheDocument();
    expect(screen.getByText(/doi:10\.13127\/etna\/tvchn/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(screen.getByText(/EarthRadar .* non ne è proprietario/)).toBeInTheDocument();
    expect(CAM_SOURCES.ingv.attribution.join(' ')).toContain('GARR.tv');
  });

  it('nessun video e nessuna immagine prima del click; nessun badge LIVE', () => {
    render(<CamLiveBody cam={etna} onClose={() => {}} />);
    expect(camImageUrl('ingv', ETNA_UUID)).toBeNull();
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect((screen.getByTestId('live-video') as HTMLVideoElement).getAttribute('src')).toBeNull();
    expect(screen.queryByTestId('live-badge')).toBeNull();
    expect(screen.getByText(/Nessuna anteprima: premi GUARDA IN DIRETTA/)).toBeInTheDocument();
    expect(hlsImport.count).toBe(0);
    expect(hasActiveLive()).toBe(false);
  });

  it('player esistente riutilizzato: Safari nativo su GARR, Chrome via hls.js solo al tap; 🔴 LIVE a video partito', async () => {
    native = true;
    const { unmount } = render(<CamLiveBody cam={etna} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    const video = screen.getByTestId('live-video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe(`https://garr.tv/static/streaming-playlists/hls/${ETNA_UUID}/master.m3u8`);
    expect(hasActiveLive()).toBe(true);
    act(() => {
      video.dispatchEvent(new Event('playing'));
    });
    expect(screen.getByTestId('live-badge').textContent).toContain('LIVE');
    unmount();
    expect(hasActiveLive()).toBe(false);

    native = false;
    render(<CamLiveBody cam={eolie} onClose={() => {}} />);
    expect(hlsImport.count).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(hlsImport.count).toBe(1);
  });
});
