import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Cam } from '@/services/camCatalog';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hasActiveLive, stopActiveLive } from '@/lib/livePlayer';
import { LIVE_MAX_MS, LIVE_WARN_BEFORE_MS } from '@/hooks/useLivePlayer';

/** Vista video ingrandita: stesso <video>, stesso stream, mai due HLS. */

const hls = vi.hoisted(() => ({ imports: 0, instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));
vi.mock('hls.js/light', () => {
  hls.imports++;
  class FakeHls {
    static Events = { ERROR: 'e', MANIFEST_PARSED: 'm' };
    static ErrorTypes = { NETWORK_ERROR: 'n', MEDIA_ERROR: 'md' };
    static isSupported = () => true;
    loadSource = vi.fn();
    attachMedia = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    constructor() {
      hls.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
    }
    on() {}
  }
  return { default: FakeHls };
});

const ETNA: Cam = {
  source: 'ingv',
  id: 'c6c70a03-e711-4eed-9835-1d02f5a5ec58',
  lat: 37.751,
  lon: 14.994,
  name: 'Etna — INGV TV (crateri sommitali), Sicilia',
  type: 'live',
  stream: 'c6c70a03-e711-4eed-9835-1d02f5a5ec58',
};
const catalog = vi.hoisted(() => ({ cams: [] as Cam[] }));
vi.mock('@/hooks/useCamCatalog', () => ({
  useCamCatalog: () => ({ cams: catalog.cams, source: 'fresh', loading: false, error: null, fetchedAt: 0 }),
}));

import CamCard, { CamLiveBody } from './CamCard';

let native = false;
const video = () => screen.getByTestId('live-video') as HTMLVideoElement;
const media = () => screen.getByTestId('live-media');
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

async function startPlaying() {
  fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
  await flush();
  act(() => {
    video().dispatchEvent(new Event('playing'));
  });
}

beforeEach(() => {
  hls.imports = 0;
  hls.instances.length = 0;
  native = false;
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => (native ? 'maybe' : ''));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  useSettingsStore.setState({ language: 'it' });
});
afterEach(() => {
  cleanup();
  stopActiveLive();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  delete (HTMLVideoElement.prototype as { webkitEnterFullscreen?: unknown }).webkitEnterFullscreen;
  document.body.style.overflow = '';
});

describe('vista video grande', () => {
  it('⛶ compare solo a video partito; apre l’overlay con 🔴 LIVE, nome e fonte (niente licenze)', async () => {
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ingrandisci video' })).toBeNull();
    await startPlaying();
    const btn = screen.getByRole('button', { name: 'Ingrandisci video' });
    expect(btn).toHaveAttribute('title', 'Ingrandisci video');
    fireEvent.click(btn);
    expect(media().dataset.expanded).toBe('true');
    expect(media().className).toContain('fixed inset-0');
    expect(media().querySelector('[data-testid="live-badge"]')?.textContent).toContain('LIVE');
    expect(media().textContent).toContain('Etna — INGV TV');
    expect(media().textContent).toContain('INGV – Osservatorio Etneo');
    expect(media().textContent).not.toContain('doi:'); // licenze solo nella CamCard
    expect(video().className).toContain('object-contain'); // niente crop/deformazione
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('stesso elemento <video> e stesso stream: mai un secondo HLS, nessun nuovo caricamento', async () => {
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    const before = video();
    const importsBefore = hls.imports;
    expect(hls.instances).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    expect(video()).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi vista grande' }));
    expect(video()).toBe(before);
    expect(hls.imports).toBe(importsBefore);
    expect(hls.instances).toHaveLength(1);
    expect(hls.instances[0].loadSource).toHaveBeenCalledTimes(1);
    expect(hls.instances[0].destroy).not.toHaveBeenCalled();
    expect(hasActiveLive()).toBe(true);
  });

  it('X chiude la vista grande e torna alla CamCard con la LIVE ancora attiva', async () => {
    native = true;
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    const src = video().getAttribute('src');
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi vista grande' }));
    expect(media().dataset.expanded).toBe('false');
    expect(screen.getByTestId('live-badge').textContent).toContain('LIVE');
    expect(video().getAttribute('src')).toBe(src);
    expect(hasActiveLive()).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('ESC chiude SOLO la vista grande, non la CamCard', async () => {
    native = true;
    catalog.cams = [ETNA];
    useLayersStore.getState().setCamEnabled(true);
    useLayersStore.getState().setSelectedCam({ source: ETNA.source, id: ETNA.id });
    render(<CamCard />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(media().dataset.expanded).toBe('false');
    expect(useLayersStore.getState().selectedCam).not.toBeNull();
    expect(hasActiveLive()).toBe(true);
    // Un secondo ESC (vista chiusa) chiude la CamCard come prima → stream fermato.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useLayersStore.getState().selectedCam).toBeNull();
    expect(hasActiveLive()).toBe(false);
    useLayersStore.getState().setCamEnabled(false);
  });

  it('Fullscreen API disponibile: pulsante schermo intero sul contenitore', async () => {
    const req = vi.fn(() => Promise.resolve());
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen = req;
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schermo intero' }));
    expect(req).toHaveBeenCalledTimes(1);
    expect(req.mock.contexts[0]).toBe(media());
  });

  it('Fullscreen API assente: nessun pulsante schermo intero, la vista grande funziona comunque', async () => {
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    expect(screen.queryByRole('button', { name: 'Schermo intero' })).toBeNull();
    expect(media().dataset.expanded).toBe('true');
  });

  it('iPhone: senza Fullscreen API usa il player nativo dello stesso <video>', async () => {
    const enter = vi.fn();
    (HTMLVideoElement.prototype as { webkitEnterFullscreen?: unknown }).webkitEnterFullscreen = enter;
    native = true;
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schermo intero' }));
    expect(enter).toHaveBeenCalledTimes(1);
    expect(enter.mock.contexts[0]).toBe(video());
  });

  it('timeout 3 minuti anche nella vista grande: "Continua LIVE" accessibile, poi stop e chiusura vista', async () => {
    native = true;
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    vi.useFakeTimers();
    act(() => {
      video().dispatchEvent(new Event('playing'));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    act(() => {
      vi.advanceTimersByTime(LIVE_MAX_MS - LIVE_WARN_BEFORE_MS);
    });
    const cont = screen.getAllByRole('button', { name: 'Continua LIVE' });
    expect(cont.some((b) => media().contains(b))).toBe(true);
    fireEvent.click(cont.find((b) => media().contains(b))!);
    act(() => {
      vi.advanceTimersByTime(LIVE_MAX_MS + 1000);
    });
    expect(hasActiveLive()).toBe(false);
    expect(media().dataset.expanded).toBe('false');
    expect(screen.getByText(/dopo 3 minuti/)).toBeInTheDocument();
  });

  it('CAM OFF chiude tutto: vista grande, CamCard e stream', async () => {
    catalog.cams = [ETNA];
    useLayersStore.getState().setCamEnabled(true);
    useLayersStore.getState().setSelectedCam({ source: ETNA.source, id: ETNA.id });
    render(<CamCard />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    act(() => useLayersStore.getState().setCamEnabled(false));
    expect(screen.queryByTestId('live-media')).toBeNull();
    expect(hasActiveLive()).toBe(false);
    expect(hls.instances[0].destroy).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });

  it('mobile: overlay a tutta viewport, controlli touch ≥ 44 px, nessun orientamento forzato', async () => {
    render(<CamLiveBody cam={ETNA} onClose={() => {}} />);
    await startPlaying();
    fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci video' }));
    expect(media().className).toMatch(/fixed inset-0/);
    const close = screen.getByRole('button', { name: 'Chiudi vista grande' });
    expect(close.className).toContain('min-h-[44px]');
    expect(close.className).toContain('min-w-[44px]');
    const orientation = (screen as unknown as { orientation?: { lock?: unknown } }).orientation;
    expect(orientation?.lock).toBeUndefined();
  });
});
