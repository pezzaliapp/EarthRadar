import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSettingsStore } from '@/store/settingsStore';
import type { UseSeismicAnomalyState } from '@/hooks/useSeismicAnomaly';
import type { AnomalyAnalysis } from '@/lib/seismicAnalysis';

// Mock del hook: la pagina è testata in isolamento dalla rete USGS.
const mockState = vi.fn<() => UseSeismicAnomalyState>();
vi.mock('@/hooks/useSeismicAnomaly', () => ({
  useSeismicAnomaly: () => mockState(),
}));

import SeismicAnomaly from './SeismicAnomaly';

function makeAnalysis(overrides: Partial<AnomalyAnalysis> = {}): AnomalyAnalysis {
  const samples = Array.from({ length: 40 }, (_, i) => 30 + (i % 11));
  return {
    windowDays: 30,
    threshold: 5.5,
    currentCount: 34,
    currentEnergyJoules: 3e17,
    baselineWindowEnergyMean: 4e17,
    deviation: {
      level: 'normal',
      percentile: 42,
      mean: 35,
      median: 35,
      sd: 3.2,
      zScore: -0.3,
      percentChange: -3,
      sampleSize: samples.length,
      lowCountCaution: false,
    },
    baselineSamples: samples,
    annual: [
      { year: 2023, count: 520, energyJoules: 1e17 },
      { year: 2024, count: 344, energyJoules: 9e16 },
      { year: 2025, count: 513, energyJoules: 1.1e17 },
    ],
    currentBins: { m55: 20, m60: 12, m70: 2 },
    baselineBins: { m55: 22, m60: 11, m70: 1 },
    aftershock: { clusteredFraction: 0.1, mainshockMag: 6.4, likelySequence: false, eventCount: 34 },
    now: Date.parse('2025-06-01T00:00:00Z'),
    windowBaseCount: 34,
    ...overrides,
  };
}

function baseState(overrides: Partial<UseSeismicAnomalyState> = {}): UseSeismicAnomalyState {
  return {
    analysis: makeAnalysis(),
    source: 'fresh',
    loading: false,
    error: null,
    fetchedAt: Date.parse('2025-06-01T12:00:00Z'),
    baselineMeta: {
      source: 'USGS Earthquake Hazards Program — FDSN',
      endpoint: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
      generatedAt: '2026-08-18T00:00:00Z',
      baselineStart: '2006-01-01',
      baselineEnd: '2025-12-31',
      thresholds: [5.5, 6, 7],
      windowsDays: [30, 60, 90],
      windowStepDays: 30,
      energyFormula: 'E = 10^(1.5M+4.8)',
      energyUnit: 'joule',
      declustering: 'nessuno',
      exclusions: 'nessuna',
      totalEventsBaseMag: 9827,
      baseMinMagnitude: 5.5,
      methodology: 'test',
      license: 'USGS public domain',
      attribution: 'USGS',
      reproduce: 'node scripts/generateSeismicBaseline.mjs',
    },
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SeismicAnomaly />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // jsdom usa navigator.language "en-US": forziamo IT per asserire il testo.
  useSettingsStore.getState().setLanguage('it');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SeismicAnomaly page', () => {
  it('renders title, subtitle and the guiding question', () => {
    mockState.mockReturnValue(baseState());
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Anomalia Sismica/i })).toBeInTheDocument();
    expect(screen.getByText(/Confrontare i dati, non le impressioni/i)).toBeInTheDocument();
    expect(
      screen.getByText(/L'attività sismica attuale è statisticamente diversa/i),
    ).toBeInTheDocument();
  });

  it('shows the deviation index label for the current level', () => {
    mockState.mockReturnValue(baseState());
    renderPage();
    expect(screen.getByText('Nella norma')).toBeInTheDocument();
    expect(screen.getByText(/Scostamento dalla baseline/i)).toBeInTheDocument();
  });

  it('renders the specific non-prediction disclaimer', () => {
    mockState.mockReturnValue(baseState());
    renderPage();
    expect(
      screen.getByText(/EarthRadar non prevede terremoti/i),
    ).toBeInTheDocument();
  });

  it('renders the "how to read" and "method" educational panels', () => {
    mockState.mockReturnValue(baseState());
    renderPage();
    expect(screen.getByText(/Come leggere questi dati/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Metodo$/ })).toBeInTheDocument();
    expect(screen.getByText(/Più terremoti non significa automaticamente/i)).toBeInTheDocument();
  });

  it('renders SVG charts (native, no chart library)', () => {
    mockState.mockReturnValue(baseState());
    const { container } = renderPage();
    const svgs = container.querySelectorAll('svg[role="img"]');
    // attuale-vs-storico, andamento annuale, energia, distribuzione magnitudo
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('shows the loading state without an analysis', () => {
    mockState.mockReturnValue(baseState({ analysis: null, loading: true, source: 'pending' }));
    renderPage();
    // Compare sia nella riga freschezza sia nella sezione di caricamento.
    expect(screen.getAllByText(/Caricamento dati sismici/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the unavailable state on error with no data', () => {
    mockState.mockReturnValue(
      baseState({ analysis: null, loading: false, error: 'boom', source: 'pending' }),
    );
    renderPage();
    expect(screen.getByText(/Dati temporaneamente non disponibili/i)).toBeInTheDocument();
  });

  it('shows the insufficient-sample message when classification is insufficient', () => {
    const insufficient = makeAnalysis({
      deviation: {
        level: 'insufficient',
        percentile: NaN,
        mean: NaN,
        median: NaN,
        sd: NaN,
        zScore: NaN,
        percentChange: NaN,
        sampleSize: 3,
        lowCountCaution: false,
      },
    });
    mockState.mockReturnValue(baseState({ analysis: insufficient }));
    renderPage();
    expect(screen.getByText('Dati insufficienti')).toBeInTheDocument();
    expect(
      screen.getByText(/Campione insufficiente per una valutazione statistica robusta/i),
    ).toBeInTheDocument();
  });
});
