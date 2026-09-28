import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { CAM_LOAD_TIMEOUT_MS, useCamSnapshot } from './useCamSnapshot';
import { CamCardBody } from '@/components/panels/CamCard';
import { CAM_SOURCES } from '@/services/camSources';
import { useSettingsStore } from '@/store/settingsStore';

const HK_STEP = CAM_SOURCES.hktd.refreshMs;
const T0 = HK_STEP * 1000; // inizio esatto di una finestra di refresh

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  setVisibility('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useCamSnapshot — refresh', () => {
  it('parte in loading con l’URL ufficiale e non aggiorna finché l’immagine non è caricata', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    expect(result.current.status).toBe('loading');
    expect(result.current.src).toBe('https://tdcctv.data.one.gov.hk/H429F.JPG?t=1000');
  });

  it('aggiorna a ogni finestra solo con pagina visibile; si ferma se nascosta', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    act(() => result.current.onLoad());
    expect(result.current.status).toBe('ok');

    act(() => {
      vi.advanceTimersByTime(HK_STEP);
    });
    expect(result.current.src).toContain('?t=1001');

    act(() => setVisibility('hidden'));
    act(() => {
      vi.advanceTimersByTime(HK_STEP * 3);
    });
    expect(result.current.src).toContain('?t=1001');

    // Di nuovo visibile: aggiorna subito alla finestra corrente.
    act(() => setVisibility('visible'));
    expect(result.current.src).toContain('?t=1004');
  });

  it('chiusura (unmount) → nessun timer residuo', () => {
    const { result, unmount } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    act(() => result.current.onLoad());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('errore → non disponibile, nessun refresh né retry automatico', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    act(() => result.current.onError());
    expect(result.current.status).toBe('unavailable');
    const src = result.current.src;
    act(() => {
      vi.advanceTimersByTime(HK_STEP * 10);
    });
    expect(result.current.src).toBe(src);
    expect(result.current.status).toBe('unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timeout senza risposta → non disponibile', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    act(() => {
      vi.advanceTimersByTime(CAM_LOAD_TIMEOUT_MS);
    });
    expect(result.current.status).toBe('unavailable');
  });

  it('retry manuale ricarica con un URL nuovo della stessa fonte', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', 'H429F'));
    act(() => result.current.onError());
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    expect(result.current.src).toBe('https://tdcctv.data.one.gov.hk/H429F.JPG?t=1000&r=1');
  });

  it('id non valido → nessun URL, subito non disponibile', () => {
    const { result } = renderHook(() => useCamSnapshot('hktd', '<script>'));
    expect(result.current.src).toBeNull();
    expect(result.current.status).toBe('unavailable');
  });
});

describe('CamCard — camera non disponibile', () => {
  beforeEach(() => useSettingsStore.getState().setLanguage('it'));
  const cam = {
    source: 'hktd' as const,
    id: 'H429F',
    lat: 22.24,
    lon: 114.15,
    name: 'Aberdeen Praya Road',
    type: 'snap' as const,
  };

  it('mostra nome, SNAP, fonte, attribuzione e UNA sola preview dall’host ufficiale', () => {
    render(<CamCardBody cam={cam} onClose={() => {}} />);
    expect(screen.getByText(/Aberdeen Praya Road/)).toBeInTheDocument();
    expect(screen.getByText('SNAP')).toBeInTheDocument();
    expect(screen.getAllByText(/Transport Department, HKSAR Government/).length).toBeGreaterThan(0);
    const imgs = document.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toMatch(/^https:\/\/tdcctv\.data\.one\.gov\.hk\/H429F\.JPG\?t=/);
    expect(imgs[0].getAttribute('referrerpolicy')).toBe('no-referrer');
    for (const a of document.querySelectorAll('a')) {
      expect(a.getAttribute('href')).toMatch(/^https:\/\//);
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('immagine 404/irraggiungibile → "Camera non disponibile" + link originale, nessun errore', () => {
    render(<CamCardBody cam={cam} onClose={() => {}} />);
    fireEvent.error(document.querySelector('img')!);
    expect(screen.getByText('Camera non disponibile')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    const link = screen.getByText(/Apri immagine originale/).closest('a');
    expect(link?.getAttribute('href')).toBe('https://tdcctv.data.one.gov.hk/H429F.JPG');
    act(() => {
      vi.advanceTimersByTime(HK_STEP * 5);
    });
    expect(document.querySelector('img')).toBeNull();
  });
});
