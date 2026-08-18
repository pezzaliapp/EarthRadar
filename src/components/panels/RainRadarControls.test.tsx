import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useSettingsStore } from '@/store/settingsStore';
import { useLayersStore } from '@/store/layersStore';

// useRadarFrames fa fetch di rete: lo mockiamo con frame deterministici.
vi.mock('@/hooks/useRadarFrames', () => ({
  useRadarFrames: () => ({
    frames: {
      all: [
        { time: 1_700_000_000, path: '/a', type: 'past' },
        { time: 1_700_000_600, path: '/b', type: 'nowcast' },
      ],
      nowIndex: 0,
      pastCount: 1,
    },
    loading: false,
    error: null,
  }),
}));

import RainRadarControls from './RainRadarControls';

beforeEach(() => {
  useSettingsStore.getState().setLanguage('it');
  useLayersStore.getState().setOverlayEnabled('rainviewer', true);
});
afterEach(() => {
  cleanup();
  useLayersStore.getState().setOverlayEnabled('rainviewer', false);
});

describe('RainRadarControls — UX collassabile', () => {
  it('non renderizza nulla se il layer radar è disattivo', () => {
    useLayersStore.getState().setOverlayEnabled('rainviewer', false);
    const { container } = render(<RainRadarControls />);
    expect(container).toBeEmptyDOMElement();
  });

  it('in jsdom (schermo non compatto) parte aperto con attribuzione RainViewer', () => {
    render(<RainRadarControls />);
    expect(screen.getByText(/Radar precipitazioni RainViewer/i)).toBeInTheDocument();
    // Attribuzione obbligatoria della fonte: NON deve mai sparire.
    expect(screen.getByText(/Radar by RainViewer\.com/i)).toBeInTheDocument();
    // Controlli presenti: play + due slider (timeline + opacità).
    expect(screen.getByRole('button', { name: /Play|Pausa/ })).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  it('si può collassare in un chip e riaprire (toggle)', () => {
    render(<RainRadarControls />);
    // Collassa
    fireEvent.click(screen.getByRole('button', { name: /Chiudi radar/i }));
    const chip = screen.getByRole('button', { name: /Radar pioggia/i });
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('min-h-[44px]'); // touch target ≥ 44px
    // Il pannello grande non è più montato
    expect(screen.queryByText(/Radar by RainViewer\.com/i)).not.toBeInTheDocument();
    // Riapri
    fireEvent.click(chip);
    expect(screen.getByText(/Radar by RainViewer\.com/i)).toBeInTheDocument();
  });

  it('il chip è ancorato in basso a destra (non collide con Apri pannello layer in alto)', () => {
    render(<RainRadarControls />);
    fireEvent.click(screen.getByRole('button', { name: /Chiudi radar/i }));
    const chip = screen.getByRole('button', { name: /Radar pioggia/i });
    expect(chip.className).toContain('bottom-2');
    expect(chip.className).toContain('right-2');
  });
});
