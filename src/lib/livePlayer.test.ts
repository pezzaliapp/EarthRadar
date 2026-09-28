import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HLS_CONFIG, hasActiveLive, startLive, stopActiveLive, type HlsCtor } from './livePlayer';

const URL_A = 'https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8';
const URL_B = 'https://video2.iowadot.gov:8888/cedarrapids/crtv59lb/playlist.m3u8';

/** Finta hls.js: registra le chiamate e permette di emettere eventi. */
function makeFakeHls(supported = true) {
  const instances: FakeHls[] = [];
  class FakeHls {
    static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    static isSupported = () => supported;
    handlers = new Map<string, (e: string, d: unknown) => void>();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    constructor(public config: Record<string, unknown>) {
      instances.push(this);
    }
    on(ev: string, cb: (e: string, d: unknown) => void) {
      this.handlers.set(ev, cb);
    }
    emit(ev: string, data: unknown) {
      this.handlers.get(ev)?.(ev, data);
    }
  }
  const loadHls = vi.fn(async () => ({ default: FakeHls as unknown as HlsCtor }));
  return { FakeHls, instances, loadHls };
}

function makeVideo(native: boolean): HTMLVideoElement {
  const v = document.createElement('video');
  v.canPlayType = vi.fn(() => (native ? 'maybe' : '')) as unknown as HTMLVideoElement['canPlayType'];
  v.play = vi.fn(() => Promise.resolve());
  v.pause = vi.fn();
  v.load = vi.fn();
  return v;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => stopActiveLive());
afterEach(() => {
  stopActiveLive();
  vi.useRealTimers();
});

describe('livePlayer — percorsi HLS', () => {
  it('HLS nativo (Safari/iOS): usa <video src>, hls.js MAI caricato', () => {
    const { loadHls } = makeFakeHls();
    const video = makeVideo(true);
    const onPlaying = vi.fn();
    startLive(video, URL_A, { onPlaying, onError: vi.fn() }, { loadHls });
    expect(video.getAttribute('src')).toBe(URL_A);
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalled();
    expect(loadHls).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('playing'));
    expect(onPlaying).toHaveBeenCalledTimes(1);
  });

  it('senza HLS nativo (Chrome/Firefox): hls.js caricato solo ora, con retry limitati', async () => {
    const { loadHls, instances } = makeFakeHls();
    const video = makeVideo(false);
    startLive(video, URL_B, { onPlaying: vi.fn(), onError: vi.fn() }, { loadHls });
    expect(loadHls).toHaveBeenCalledTimes(1);
    await flush();
    expect(instances).toHaveLength(1);
    expect(instances[0].loadSource).toHaveBeenCalledWith(URL_B);
    expect(instances[0].attachMedia).toHaveBeenCalledWith(video);
    expect(instances[0].config).toMatchObject({ manifestLoadingMaxRetry: 1, fragLoadingMaxRetry: 2 });
    expect(HLS_CONFIG.lowLatencyMode).toBe(false);
    expect(video.getAttribute('src')).toBeNull();
  });

  it('hls.js non supportato → errore "unsupported", nessuno stream', async () => {
    const { loadHls } = makeFakeHls(false);
    const onError = vi.fn();
    startLive(makeVideo(false), URL_B, { onPlaying: vi.fn(), onError }, { loadHls });
    await flush();
    expect(onError).toHaveBeenCalledWith('unsupported');
    expect(hasActiveLive()).toBe(false);
  });
});

describe('livePlayer — una sola LIVE e distruzione completa', () => {
  it('avviare una seconda LIVE distrugge la prima', async () => {
    const { loadHls, instances } = makeFakeHls();
    const a = makeVideo(false);
    const b = makeVideo(true);
    startLive(a, URL_B, { onPlaying: vi.fn(), onError: vi.fn() }, { loadHls });
    await flush();
    startLive(b, URL_A, { onPlaying: vi.fn(), onError: vi.fn() }, { loadHls });
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(a.getAttribute('src')).toBeNull();
    expect(b.getAttribute('src')).toBe(URL_A);
    expect(hasActiveLive()).toBe(true);
  });

  it('destroy: istanza hls.js distrutta, sorgente rimossa, video fermato e scaricato', async () => {
    const { loadHls, instances } = makeFakeHls();
    const video = makeVideo(false);
    const h = startLive(video, URL_B, { onPlaying: vi.fn(), onError: vi.fn() }, { loadHls });
    await flush();
    h.destroy();
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(video.pause).toHaveBeenCalled();
    expect(video.load).toHaveBeenCalled();
    expect(video.getAttribute('src')).toBeNull();
    expect(hasActiveLive()).toBe(false);
    h.destroy(); // idempotente
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
  });

  it('destroy prima che hls.js sia arrivato: nessuna istanza creata', async () => {
    const { loadHls, instances } = makeFakeHls();
    const h = startLive(makeVideo(false), URL_B, { onPlaying: vi.fn(), onError: vi.fn() }, { loadHls });
    h.destroy();
    await flush();
    expect(instances).toHaveLength(0);
  });
});

describe('livePlayer — errori, timeout, nessun retry infinito', () => {
  it('errore di rete fatale → "network", stream distrutto, nessun nuovo tentativo', async () => {
    const { loadHls, instances, FakeHls } = makeFakeHls();
    const onError = vi.fn();
    startLive(makeVideo(false), URL_B, { onPlaying: vi.fn(), onError }, { loadHls });
    await flush();
    instances[0].emit(FakeHls.Events.ERROR, { fatal: false, type: 'networkError' }); // non fatale: ignorato
    expect(onError).not.toHaveBeenCalled();
    instances[0].emit(FakeHls.Events.ERROR, { fatal: true, type: 'networkError' });
    expect(onError).toHaveBeenCalledWith('network');
    expect(instances[0].destroy).toHaveBeenCalled();
    expect(instances[0].loadSource).toHaveBeenCalledTimes(1);
    expect(loadHls).toHaveBeenCalledTimes(1);
  });

  it('errore media: UN solo recupero, al secondo → "media"', async () => {
    const { loadHls, instances, FakeHls } = makeFakeHls();
    const onError = vi.fn();
    startLive(makeVideo(false), URL_B, { onPlaying: vi.fn(), onError }, { loadHls });
    await flush();
    instances[0].emit(FakeHls.Events.ERROR, { fatal: true, type: 'mediaError' });
    expect(instances[0].recoverMediaError).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    instances[0].emit(FakeHls.Events.ERROR, { fatal: true, type: 'mediaError' });
    expect(instances[0].recoverMediaError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('media');
  });

  it('stream offline (video nativo in errore) → "offline"', () => {
    const video = makeVideo(true);
    const onError = vi.fn();
    startLive(video, URL_A, { onPlaying: vi.fn(), onError });
    video.dispatchEvent(new Event('error'));
    expect(onError).toHaveBeenCalledWith('offline');
    expect(video.getAttribute('src')).toBeNull();
  });

  it('nessun fotogramma entro il timeout → "timeout"', () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    startLive(makeVideo(true), URL_A, { onPlaying: vi.fn(), onError }, { startTimeoutMs: 5000 });
    vi.advanceTimersByTime(4999);
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledWith('timeout');
    expect(vi.getTimerCount()).toBe(0);
  });
});
