import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';

/**
 * Smoke test della Home: deve montare senza far scattare l'ErrorBoundary.
 *
 * Nasce dal bug runtime "Cannot read properties of null (reading 'useState')"
 * (hotfix fix/react-dedupe). Questo test rileva la classe di problemi:
 *  - doppia istanza di React nel bundle
 *  - hook chiamati su un client React diverso da quello che renderizza
 *  - import eager di moduli 3D pesanti durante il render della Home
 *
 * Se compare il messaggio di errore localizzato dell'ErrorBoundary
 * ("Qualcosa è andato storto") il test fallisce.
 */
describe('Home', () => {
  afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('renders without falling back to the ErrorBoundary', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Qualcosa è andato storto/i)).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });
});
