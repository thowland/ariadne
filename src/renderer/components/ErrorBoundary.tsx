import { Component } from 'react';

import { Logo } from './Logo';

interface State {
  error: Error | null;
}

/**
 * Last-resort catch for render crashes: shows a reload screen instead of a
 * white window. Data is safe — every edit was already persisted.
 */
export class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render(): React.ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="loading-screen" role="alert">
        <Logo size={48} />
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ maxWidth: 420, textAlign: 'center', fontSize: 13.5, lineHeight: 1.5 }}>
          Ariadne hit an unexpected error while rendering. Your data is safe on disk — every change
          is saved as you make it.
        </p>
        <code className="error-detail">{this.state.error.message}</code>
        <button
          className="btn primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload Ariadne
        </button>
      </div>
    );
  }
}
