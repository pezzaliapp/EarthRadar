import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Cam } from '@/services/camCatalog';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hasActiveLive, stopActiveLive } from '@/lib/livePlayer';
import { LIVE_MAX_MS, LIVE_WARN_BEFORE_MS } from '@/hooks/useLivePlayer';

// hls.js reale sostituito da un finto modulo: contiamo QUANDO viene importato.
const hlsImport = vi.hoisted(() => ({ count: 0, instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));
vi.mock('hls.js/light', () => {
  hlsImport.count++;
  class FakeHls {
    static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static isSupported = () => true;
    handlers = new Map<string, (e: string, d: unknown) => void>();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    constructor() {
      hlsImport.instances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
    }
    on(ev: string, cb: (e: string, d: unknown) => void) {
      this.handlers.set(ev, cb);
    }
  }
  return { default: FakeHls };
});

const CALTRANS: Cam = {
  source: 'caltrans',
  id: 'd7/i110196avenue26offramp',
  lat: 34.0837,
  lon: -118.2215,
  name: 'I-110 : (196) Avenue 26 Off Ramp — Cypress Park',
  type: 'live',
  stream: 'D7/CCTV-196',
};
const IOWA: Cam = {
  source: 'iowa',
  id: '2/councilbluffs/cbtv74lb',
  lat: 41.346,
  lon: -95.9358,
  name: 'CB - I-680 @ MM 1.1 (130th St) — Council Bluffs',
  type: 'live',
  stream: '2/councilbluffs/cbtv74lb',
  poster: 'SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg',
};

const catalogState = vi.hoisted(() => ({ cams: [] as Cam[] }));
vi.mock('@/hooks/useCamCatalog', () => ({
  useCamCatalog: () => ({ cams: catalogState.cams, source: 'fresh', loading: false, error: null, fetchedAt: 0 }),
}));

import CamCard, { CamLiveBody } from './CamCard';

let native = false;
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}
const video = () => screen.getByTestId('live-video') as HTMLVideoElement;
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  hlsImport.count = 0;
  hlsImport.instances.length = 0;
  native = false;
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => (native ? 'maybe' : ''));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  useSettingsStore.setState({ language: 'it' });
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  stopActiveLive();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('CamCard LIVE — prima del tap', () => {
  it('poster + "GUARDA IN DIRETTA": nessun video, nessun hls.js, mai il badge LIVE', () => {
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ })).toBeInTheDocument();
    expect(screen.getByText('Il video può utilizzare traffico dati.')).toBeInTheDocument();
    expect(screen.getByText('Anteprima: immagine fissa')).toBeInTheDocument();
    expect(screen.queryByTestId('live-badge')).toBeNull();
    expect(video().getAttribute('src')).toBeNull();
    expect(hlsImport.count).toBe(0);
    expect(hasActiveLive()).toBe(false);
    const poster = document.querySelector('img')!;
    expect(poster.getAttribute('src')).toBe(
      'https://cwwp2.dot.ca.gov/data/d7/cctv/image/i110196avenue26offramp/i110196avenue26offramp.jpg',
    );
  });
});

describe('CamCard LIVE — riproduzione', () => {
  it('Chrome (senza HLS nativo): hls.js importato solo al tap, badge 🔴 LIVE solo quando parte il video', async () => {
    render(<CamLiveBody cam={IOWA} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    expect(screen.queryByTestId('live-badge')).toBeNull(); // in connessione, non ancora LIVE
    await flush();
    expect(hlsImport.count).toBe(1);
    expect(hlsImport.instances[0].loadSource).toHaveBeenCalledWith(
      'https://video2.iowadot.gov:8888/councilbluffs/cbtv74lb/playlist.m3u8',
    );
    act(() => {
      video().dispatchEvent(new Event('playing'));
    });
    expect(screen.getByTestId('live-badge').textContent).toContain('LIVE');
  });

  it('Safari/iOS (HLS nativo): <video src> diretto, hls.js mai importato', async () => {
    native = true;
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    await flush();
    expect(video().getAttribute('src')).toBe('https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8');
    expect(hlsImport.count).toBe(0);
  });

  it('chiusura della scheda → stream distrutto', async () => {
    native = true;
    const { unmount } = render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    const v = video();
    expect(hasActiveLive()).toBe(true);
    unmount();
    expect(hasActiveLive()).toBe(false);
    expect(v.getAttribute('src')).toBeNull();
  });

  it('pagina nascosta → stop completo; al ritorno NON riparte da sola', async () => {
    native = true;
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    act(() => {
      video().dispatchEvent(new Event('playing'));
    });
    act(() => setVisibility('hidden'));
    expect(hasActiveLive()).toBe(false);
    expect(video().getAttribute('src')).toBeNull();
    expect(screen.getByText(/pagina non era visibile/)).toBeInTheDocument();
    act(() => setVisibility('visible'));
    expect(hasActiveLive()).toBe(false);
    expect(screen.queryByTestId('live-badge')).toBeNull();
    expect(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ })).toBeInTheDocument();
  });

  it('timeout di 3 minuti: "Continua LIVE" prima dello stop, poi stop automatico', async () => {
    vi.useFakeTimers();
    native = true;
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    act(() => {
      video().dispatchEvent(new Event('playing'));
    });
    act(() => {
      vi.advanceTimersByTime(LIVE_MAX_MS - LIVE_WARN_BEFORE_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continua LIVE' }));
    act(() => {
      vi.advanceTimersByTime(LIVE_MAX_MS - 1000);
    });
    expect(hasActiveLive()).toBe(true); // prorogata
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(hasActiveLive()).toBe(false);
    expect(screen.getByText(/dopo 3 minuti/)).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0); // nessun timer LIVE residuo
  });

  it('stream in errore → OFFLINE, nessun retry automatico', async () => {
    vi.useFakeTimers();
    native = true;
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    act(() => {
      video().dispatchEvent(new Event('error'));
    });
    expect(screen.getAllByText('OFFLINE').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('live-badge')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(hasActiveLive()).toBe(false);
    expect(video().getAttribute('src')).toBeNull();
    expect(screen.getByRole('button', { name: /Riprova la diretta/ })).toBeInTheDocument();
  });
});

describe('CamCard LIVE — attribuzioni e CAM OFF', () => {
  it('Caltrans: attribuzione e condizioni d’uso', () => {
    render(<CamLiveBody cam={CALTRANS} onClose={() => {}} />);
    expect(screen.getByText('Video and images: Caltrans — California Department of Transportation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Caltrans Conditions of Use/ })).toHaveAttribute(
      'href',
      'https://dot.ca.gov/conditions-of-use',
    );
  });

  it('Iowa DOT: attribuzione e licenza CC BY 4.0', () => {
    render(<CamLiveBody cam={IOWA} onClose={() => {}} />);
    expect(screen.getByText('Iowa Department of Transportation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(document.querySelector('img')!.getAttribute('src')).toBe(
      'https://atmsqf.iowadot.gov/SNAPSHOTS/PUBLIC/Metro/cbtv74hd.jpeg',
    );
  });

  it('CAM OFF → scheda chiusa e stream distrutto', async () => {
    native = true;
    catalogState.cams = [CALTRANS];
    useLayersStore.getState().setCamEnabled(true);
    useLayersStore.getState().setSelectedCam({ source: CALTRANS.source, id: CALTRANS.id });
    render(<CamCard />);
    fireEvent.click(screen.getByRole('button', { name: /GUARDA IN DIRETTA/ }));
    expect(hasActiveLive()).toBe(true);
    act(() => useLayersStore.getState().setCamEnabled(false));
    expect(hasActiveLive()).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('SNAP invariato: nessun pulsante LIVE, nessun <video>', () => {
    catalogState.cams = [
      { source: 'hktd', id: 'H429F', lat: 22.24, lon: 114.15, name: 'Aberdeen', type: 'snap' },
    ];
    useLayersStore.getState().setSelectedCam({ source: 'hktd', id: 'H429F' });
    render(<CamCard />);
    expect(screen.getByText('SNAP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /GUARDA IN DIRETTA/ })).toBeNull();
    expect(document.querySelector('video')).toBeNull();
    useLayersStore.getState().setSelectedCam(null);
  });
});
