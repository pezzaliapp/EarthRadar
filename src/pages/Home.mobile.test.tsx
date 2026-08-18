import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Regressione UX: Home «map-first» su smartphone portrait.
 *
 * Su mobile l'hero deve restare compatto (solo titolo + toggle vista): intro e
 * avviso "fase 1" sono nascosti (visibili solo da sm+), così mappa e controlli
 * overlay sono subito visibili senza scorrere. La mappa è più bassa su mobile
 * (62vh) e piena su desktop (70vh).
 *
 * jsdom non ha WebGL/Leaflet affidabili: stub leggeri come in Home.layerPanel.
 */
vi.mock('@/components/maps/Globe3D', () => ({
  default: () => <div data-testid="globe3d-stub" />,
}));
vi.mock('@/components/maps/Map2D', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map2d-stub">{children}</div>
  ),
}));

import App from '@/App';
import { useSettingsStore } from '@/store/settingsStore';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

describe('Home — hero compatto / map-first mobile', () => {
  beforeEach(() => {
    window.localStorage.clear();
    act(() => useSettingsStore.setState({ viewMode: '2d', language: 'it' }));
  });
  afterEach(() => cleanup());

  it('nasconde intro e avviso fase 1 su mobile (visibili solo da sm+)', async () => {
    const { container } = renderHome();
    // Attende il mount della Home (lazy).
    await screen.findByText(/Cosa sta succedendo sulla Terra adesso/i);

    const intro = container.querySelector('p.hidden.sm\\:block');
    expect(intro).not.toBeNull();
    expect(intro?.textContent).toMatch(/combinati in un'unica vista live/i);

    const notice = screen.getByText(/Fase 1 attiva/i);
    expect(notice.className).toContain('hidden');
    expect(notice.className).toContain('sm:block');
  });

  it('la mappa è più bassa su mobile (62vh) e piena su desktop (70vh)', async () => {
    const { container } = renderHome();
    await screen.findByText(/Cosa sta succedendo sulla Terra adesso/i);

    const mapBox = container.querySelector('[class*="62vh"]');
    expect(mapBox).not.toBeNull();
    expect(mapBox?.className).toContain('h-[min(62vh,560px)]');
    expect(mapBox?.className).toContain('sm:h-[min(70vh,560px)]');
  });

  it('mantiene il titolo sempre visibile (non nascosto su mobile)', async () => {
    renderHome();
    const h1 = await screen.findByRole('heading', {
      level: 1,
      name: /Cosa sta succedendo sulla Terra adesso/i,
    });
    expect(h1.className).not.toContain('hidden');
  });
});
