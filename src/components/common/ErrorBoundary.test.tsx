import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Controlliamo il comportamento di recupero mockando gli helper PWA.
const isChunkLoadError = vi.fn<(e: unknown) => boolean>();
const reloadForChunkError = vi.fn<() => boolean>();
vi.mock('@/lib/pwaUpdate', () => ({
  isChunkLoadError: (e: unknown) => isChunkLoadError(e),
  reloadForChunkError: () => reloadForChunkError(),
}));

import ErrorBoundary from './ErrorBoundary';

function Thrower({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

let consoleErr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React logga l'errore catturato: silenziamo per un output pulito.
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  consoleErr.mockRestore();
  vi.clearAllMocks();
});

describe('ErrorBoundary', () => {
  it('mostra la UI d’errore per un normale errore runtime (nessun reload)', () => {
    isChunkLoadError.mockReturnValue(false);
    render(
      <ErrorBoundary>
        <Thrower message="Cannot read properties of undefined" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Qualcosa è andato storto/i)).toBeInTheDocument();
    expect(reloadForChunkError).not.toHaveBeenCalled();
  });

  it('su chunk obsoleto tenta UN reload e mostra il placeholder di aggiornamento', () => {
    isChunkLoadError.mockReturnValue(true);
    reloadForChunkError.mockReturnValue(true); // reload avviato
    render(
      <ErrorBoundary>
        <Thrower message="Importing a module script failed" />
      </ErrorBoundary>,
    );
    expect(reloadForChunkError).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Aggiornamento all'ultima versione/i)).toBeInTheDocument();
    expect(screen.queryByText(/Qualcosa è andato storto/i)).not.toBeInTheDocument();
  });

  it('se il reload è soppresso (anti-loop) mostra la UI d’errore', () => {
    isChunkLoadError.mockReturnValue(true);
    reloadForChunkError.mockReturnValue(false); // reload già tentato di recente
    render(
      <ErrorBoundary>
        <Thrower message="Importing a module script failed" />
      </ErrorBoundary>,
    );
    expect(reloadForChunkError).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Qualcosa è andato storto/i)).toBeInTheDocument();
  });
});
