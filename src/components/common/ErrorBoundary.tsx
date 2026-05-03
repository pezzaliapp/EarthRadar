import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
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
