import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Education from '@/pages/Education';
import LayerEducationCard from './LayerEducationCard';
import GlossaryItem from './GlossaryItem';
import TutorialCard from './TutorialCard';
import DataSourceCard from './DataSourceCard';
import { LAYERS, GLOSSARY, TUTORIALS, DATA_SOURCES } from './educationData';
import { useSettingsStore } from '@/store/settingsStore';

// jsdom defaults navigator.language to "en-US", which would route i18n to EN.
// Force IT so the regexes below remain stable regardless of host locale.
beforeEach(() => {
  useSettingsStore.getState().setLanguage('it');
});

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') window.localStorage.clear();
});

function renderEducation() {
  return render(
    <MemoryRouter initialEntries={['/education']}>
      <Education />
    </MemoryRouter>,
  );
}

describe('Education page', () => {
  it('renders all 5 hash-anchored sections', () => {
    renderEducation();
    // sectionTitle keys come from education.{layers,glossary,tutorials,sources,extra}.sectionTitle
    expect(document.getElementById('layers')).toBeInTheDocument();
    expect(document.getElementById('glossary')).toBeInTheDocument();
    expect(document.getElementById('tutorials')).toBeInTheDocument();
    expect(document.getElementById('sources')).toBeInTheDocument();
    expect(document.getElementById('extra')).toBeInTheDocument();
  });

  it('renders one card per layer (9 layers expected)', () => {
    renderEducation();
    // Each card has a heading id `layer-<id>-title`.
    for (const layer of LAYERS) {
      expect(document.getElementById(`layer-${layer.id}-title`)).toBeInTheDocument();
    }
  });

  it('renders one row per data source (11 sources expected)', () => {
    renderEducation();
    for (const source of DATA_SOURCES) {
      expect(document.getElementById(`src-${source.id}-title`)).toBeInTheDocument();
    }
  });

  it('filters the glossary by search query (case-insensitive)', () => {
    renderEducation();
    const initialCount = screen.getAllByRole('button').filter((b) =>
      b.getAttribute('aria-controls'),
    ).length;
    expect(initialCount).toBeGreaterThanOrEqual(GLOSSARY.length);

    const input = screen.getByPlaceholderText(/cerca un termine/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'apogeo' } });

    // After filtering only the "Apogeo" entry should remain visible as accordion header.
    const headers = screen.getAllByRole('button').filter((b) =>
      b.getAttribute('aria-controls'),
    );
    expect(headers.length).toBeLessThan(initialCount);
    expect(headers.some((b) => /apogeo/i.test(b.textContent ?? ''))).toBe(true);
  });

  it('shows the no-results message for an unmatched query', () => {
    renderEducation();
    const input = screen.getByPlaceholderText(/cerca un termine/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'xxxzzzqqq-no-such-term' } });
    expect(screen.getByText(/nessun termine trovato/i)).toBeInTheDocument();
  });
});

describe('LayerEducationCard', () => {
  it('renders the four educational blocks (what / where / howToRead / limits)', () => {
    const entry = LAYERS[0]; // quakes
    render(<LayerEducationCard entry={entry} />);
    expect(screen.getByText(/cosa è/i)).toBeInTheDocument();
    expect(screen.getByText(/da dove viene/i)).toBeInTheDocument();
    expect(screen.getByText(/come si interpreta/i)).toBeInTheDocument();
    expect(screen.getByText(/limiti/i)).toBeInTheDocument();
  });
});

describe('GlossaryItem', () => {
  it('toggles the accordion panel on click', () => {
    const entry = GLOSSARY.find((g) => g.id === 'tle')!;
    render(
      <ul>
        <GlossaryItem entry={entry} term="TLE" />
      </ul>,
    );
    const button = screen.getByRole('button', { name: /tle/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    // Definition is rendered inside the panel after expansion.
    expect(screen.getByText(/due righe di 69 caratteri/i)).toBeInTheDocument();
  });
});

describe('TutorialCard', () => {
  it('renders all steps and switches active body on click', () => {
    const entry = TUTORIALS.find((t) => t.id === 'iss')!; // 4 steps
    render(<TutorialCard entry={entry} />);
    const stepButtons = screen.getAllByRole('button');
    // 4 steps + (no expand controls) => exactly 4 step buttons in this card
    expect(stepButtons).toHaveLength(entry.stepCount);
    // Step 1 is active by default — `aria-expanded` attribute reflects that.
    expect(stepButtons[0]).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(stepButtons[2]);
    expect(stepButtons[2]).toHaveAttribute('aria-expanded', 'true');
    expect(stepButtons[0]).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DataSourceCard', () => {
  it('hides citation by default and reveals it on toggle', () => {
    const entry = DATA_SOURCES.find((s) => s.id === 'usgsEq')!;
    render(<DataSourceCard entry={entry} />);
    const article = screen.getByRole('article');
    // Citation pre is not in DOM until toggled.
    expect(within(article).queryByText(/Real-time Feeds and Notifications/i)).toBeNull();
    const toggle = within(article).getByRole('button', { name: /mostra citation/i });
    fireEvent.click(toggle);
    expect(within(article).getByText(/Real-time Feeds and Notifications/i)).toBeInTheDocument();
  });
});
