import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCamCatalog } from '@/services/camCatalog';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';

// Catalogo REALE pubblicato (2.629 camere), senza rete.
const catalog = parseCamCatalog(
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../public/cam/cams-v2.json'), 'utf8')),
);
vi.mock('@/hooks/useCamCatalog', () => ({
  useCamCatalog: () => ({ cams: catalog.cams, source: 'fresh', loading: false, error: null, fetchedAt: 0 }),
}));

import CamExplorer from './CamExplorer';
import { formatCount } from '@/lib/camExplorer';
import { CAM_SOURCES } from '@/services/camSources';
import CamSourcesInfo from './CamSourcesInfo';

// IntersectionObserver controllabile: nessuna riga è "visibile" finché il test non lo dice.
class FakeIO {
  static instances: FakeIO[] = [];
  targets: Element[] = [];
  constructor(private cb: IntersectionObserverCallback) {
    FakeIO.instances.push(this);
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords() {
    return [];
  }
  static show(el: Element, visible = true) {
    for (const io of FakeIO.instances) {
      if (io.targets.includes(el)) {
        io.cb([{ target: el, isIntersecting: visible } as IntersectionObserverEntry], io as unknown as IntersectionObserver);
      }
    }
  }
}

const TOTAL = catalog.cams.length;
const listEl = () => document.querySelector('[data-total]') as HTMLElement;
const rowsEls = () => [...document.querySelectorAll('[role="listitem"]')] as HTMLElement[];
const camImgs = () =>
  [...document.querySelectorAll('img')].filter((i) => /tdcctv|jamcams|weathercam/.test(i.src));

beforeEach(() => {
  FakeIO.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
  useSettingsStore.setState({ language: 'it' });
  useLayersStore.setState({
    camExplorerOpen: true,
    camTypeFilter: 'all',
    camExplorerMode: 'areas',
    selectedCam: null,
    camFocus: null,
    mapCenter: [51.51, -0.12],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CAM Explorer — esplorazione', () => {
  it('Aree: tutte le aree del catalogo, poi tutte le camere dell’area', () => {
    render(<CamExplorer variant="sidebar" />);
    expect(screen.getByText(`${formatCount(TOTAL, 'it')} camere`)).toBeInTheDocument();
    const areaButtons = within(screen.getByRole('list', { name: 'Aree' })).getAllByRole('button');
    expect(areaButtons).toHaveLength(new Set(catalog.cams.map((c) => CAM_SOURCES[c.source].region.en)).size);
    fireEvent.click(screen.getByText('Londra, Regno Unito'));
    expect(Number(listEl().dataset.total)).toBe(catalog.cams.filter((c) => c.source === 'tfl').length);
  });

  it('Zona mappa: l’elenco contiene logicamente tutte le 2.629 camere, ordinate per distanza', () => {
    useLayersStore.setState({ camExplorerMode: 'near', mapCenter: [22.3, 114.17] });
    render(<CamExplorer variant="sidebar" />);
    expect(Number(listEl().dataset.total)).toBe(TOTAL);
    // Virtualizzazione: nel DOM solo poche righe, non 2.629.
    expect(rowsEls().length).toBeLessThan(30);
    expect(rowsEls()[0].getAttribute('aria-setsize')).toBe(String(TOTAL));
    // Centro su Hong Kong → prima riga di Hong Kong.
    expect(rowsEls()[0].textContent).toContain('Hong Kong');
  });

  it('Zona mappa: spostando la mappa l’ordine si aggiorna', () => {
    useLayersStore.setState({ camExplorerMode: 'near', mapCenter: [22.3, 114.17] });
    render(<CamExplorer variant="sidebar" />);
    expect(rowsEls()[0].textContent).toContain('Hong Kong');
    act(() => useLayersStore.setState({ mapCenter: [60.17, 24.94] })); // Helsinki
    expect(rowsEls()[0].textContent).toContain('Finlandia');
  });

  it('Cerca: ricerca locale su nome/località/id', () => {
    useLayersStore.setState({ camExplorerMode: 'search' });
    render(<CamExplorer variant="sidebar" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'piccadilly' } });
    expect(screen.getByRole('status').textContent).toMatch(/risultati/);
    expect(rowsEls().every((r) => /piccadilly/i.test(r.textContent ?? ''))).toBe(true);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz-nessuna' } });
    expect(screen.getByText('Nessuna webcam trovata.')).toBeInTheDocument();
  });

  it('selezione: seleziona la camera, chiede di centrarla sulle sue coordinate e (mobile) chiude il pannello', () => {
    useLayersStore.setState({ camExplorerMode: 'search' });
    render(<CamExplorer variant="sheet" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'H429F' } });
    fireEvent.click(within(rowsEls()[0]).getByRole('button'));
    const cam = catalog.cams.find((c) => c.id === 'H429F')!;
    const s = useLayersStore.getState();
    expect(s.selectedCam).toEqual({ source: 'hktd', id: 'H429F' });
    expect(s.camFocus).toMatchObject({ lat: cam.lat, lon: cam.lon });
    expect(s.camExplorerOpen).toBe(false);
  });

  it('mobile: pannello chiudibile con ✕', () => {
    render(<CamExplorer variant="sheet" />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi CAM Explorer' }));
    expect(useLayersStore.getState().camExplorerOpen).toBe(false);
  });
});

describe('CAM Explorer — preview lazy', () => {
  it('nessuna preview finché la riga non entra nella viewport; poi solo quella', () => {
    useLayersStore.setState({ camExplorerMode: 'near' });
    render(<CamExplorer variant="sidebar" />);
    expect(camImgs()).toHaveLength(0); // righe montate ma non visibili → zero download
    const thumbs = rowsEls().map((r) => r.querySelector('.relative.h-full.w-full') as Element);
    act(() => FakeIO.show(thumbs[0]));
    expect(camImgs()).toHaveLength(1);
    expect(camImgs()[0].getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('al massimo 4 preview in download contemporaneo; uscita dalla viewport libera lo slot', () => {
    useLayersStore.setState({ camExplorerMode: 'near' });
    render(<CamExplorer variant="sidebar" />);
    const thumbs = rowsEls().map((r) => r.querySelector('.relative.h-full.w-full') as Element);
    act(() => thumbs.slice(0, 8).forEach((t) => FakeIO.show(t)));
    expect(camImgs()).toHaveLength(4);
    // Una riga in download esce dalla viewport: immagine rimossa, parte la successiva in coda.
    act(() => FakeIO.show(thumbs[0], false));
    expect(camImgs()).toHaveLength(4);
    expect(thumbs[0].querySelector('img')).toBeNull();
    expect(thumbs[4].querySelector('img')).not.toBeNull();
  });

  it('errore di una preview → "Non disponibile" solo per quella riga, nessun retry', () => {
    useLayersStore.setState({ camExplorerMode: 'near' });
    render(<CamExplorer variant="sidebar" />);
    const thumbs = rowsEls().map((r) => r.querySelector('.relative.h-full.w-full') as Element);
    act(() => {
      FakeIO.show(thumbs[0]);
      FakeIO.show(thumbs[1]);
    });
    fireEvent.error(thumbs[0].querySelector('img')!);
    fireEvent.load(thumbs[1].querySelector('img')!);
    expect(within(thumbs[0] as HTMLElement).getByText('Non disponibile')).toBeInTheDocument();
    expect(thumbs[0].querySelector('img')).toBeNull();
    expect(thumbs[1].querySelector('img')).not.toBeNull();
    act(() => FakeIO.show(thumbs[0])); // di nuovo visibile: nessun nuovo tentativo
    expect(thumbs[0].querySelector('img')).toBeNull();
  });
});

describe('LayerPanel CAM — fonti e attribuzioni', () => {
  it('chiuse di default, complete all’apertura', () => {
    useLayersStore.setState({ camExplorerOpen: false });
    render(<CamSourcesInfo />);
    const toggle = screen.getByRole('button', { name: /Fonti e attribuzioni/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Powered by TfL Open Data')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Powered by TfL Open Data')).toBeInTheDocument();
    expect(screen.getByText('Source: Fintraffic / digitraffic.fi, license CC 4.0 BY')).toBeInTheDocument();
    expect(screen.getByText(/Source: Transport Department, the Government of the HKSAR/)).toBeInTheDocument();
  });

  it('pulsante "Apri CAM Explorer"', () => {
    useLayersStore.setState({ camExplorerOpen: false });
    render(<CamSourcesInfo />);
    fireEvent.click(screen.getByRole('button', { name: /Apri CAM Explorer/ }));
    expect(useLayersStore.getState().camExplorerOpen).toBe(true);
  });
});

describe('CAM Explorer — filtro LIVE / SNAP', () => {
  const LIVE = catalog.cams.filter((c) => c.type === 'live').length;
  const SNAP = catalog.cams.filter((c) => c.type === 'snap').length;

  it('chip TUTTE / 🔴 LIVE / 📷 SNAP con conteggi coerenti', () => {
    render(<CamExplorer variant="sidebar" />);
    const group = screen.getByRole('radiogroup', { name: 'Tipo di camera' });
    const [all, live, snap] = within(group).getAllByRole('radio');
    expect(all.textContent).toContain(formatCount(TOTAL, 'it'));
    expect(live.textContent).toContain('🔴 LIVE');
    expect(live.textContent).toContain(formatCount(LIVE, 'it'));
    expect(snap.textContent).toContain('📷 SNAP');
    expect(snap.textContent).toContain(formatCount(SNAP, 'it'));
    expect(LIVE + SNAP).toBe(TOTAL);
  });

  it('LIVE + Zona mappa: solo camere LIVE, con badge ▶ LIVE e miniature immagine (nessun video)', () => {
    useLayersStore.setState({ camExplorerMode: 'near' });
    render(<CamExplorer variant="sidebar" />);
    fireEvent.click(screen.getByRole('radio', { name: /LIVE/ }));
    expect(Number(listEl().dataset.total)).toBe(LIVE);
    expect(rowsEls().every((r) => r.textContent?.includes('▶ LIVE'))).toBe(true);
    expect(document.querySelector('video')).toBeNull();
  });

  it('SNAP + Aree: solo le aree SNAP; LIVE + Cerca combinati', () => {
    render(<CamExplorer variant="sidebar" />);
    fireEvent.click(screen.getByRole('radio', { name: /SNAP/ }));
    expect(within(screen.getByRole('list', { name: 'Aree' })).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: /LIVE/ }));
    expect(within(screen.getByRole('list', { name: 'Aree' })).getAllByRole('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('tab', { name: 'Cerca' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'piccadilly' } });
    expect(screen.getByText('Nessuna webcam trovata.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /TUTTE/ }));
    expect(rowsEls().length).toBeGreaterThan(0);
  });
});
