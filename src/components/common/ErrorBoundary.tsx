import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkLoadError, reloadForChunkError } from '@/lib/pwaUpdate';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

type Phase = 'ok' | 'chunk-reloading' | 'error';

interface State {
  error: Error | null;
  phase: Phase;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, phase: 'ok' };

  static getDerivedStateFromError(error: Error): State {
    // Un chunk obsoleto (dopo un aggiornamento PWA) non è un vero crash:
    // mostriamo un placeholder di aggiornamento mentre tentiamo il reload.
    return { error, phase: isChunkLoadError(error) ? 'chunk-reloading' : 'error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkLoadError(error)) {
      // Recupero automatico: UN SOLO reload controllato (guardia anti-loop).
      const reloaded = reloadForChunkError();
      // Se il reload è stato soppresso (già tentato di recente), l'errore è
      // reale/persistente → mostriamo la UI d'errore normale.
      if (!reloaded) this.setState({ phase: 'error' });
      return;
    }
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => this.setState({ error: null, phase: 'ok' });

  render() {
    const { error, phase } = this.state;

    if (phase === 'chunk-reloading') {
      // Placeholder neutro (non allarmistico) durante il reload verso la
      // nuova release. Nessun pulsante: la pagina si sta ricaricando da sola.
      return (
        <div className="glass m-4 space-y-2 p-6 text-center">
          <p className="text-sm text-space-200">Aggiornamento all'ultima versione…</p>
          <p className="text-sm text-space-400">Updating to the latest version…</p>
        </div>
      );
    }

    if (!error || phase === 'ok') return this.props.children;
    if (this.props.fallback) return this.props.fallback(error);
    return (
      <div className="glass-strong m-4 space-y-3 p-6">
        <h2 className="text-lg font-semibold text-risk-high">Qualcosa è andato storto</h2>
        <p className="text-sm text-space-200">{error.message}</p>
        <button onClick={this.reset} className="btn-primary">
          Riprova
        </button>
      </div>
    );
  }
}
