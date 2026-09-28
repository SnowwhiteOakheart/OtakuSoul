import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { translate } from '../../i18n';

interface ErrorBoundaryProps {
  /** Changing this value (e.g. the active tab) clears a previous error. */
  resetKey?: unknown;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

/** Keeps a crash in one view from blanking the whole window. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('View crashed:', error, info.componentStack);
  }


  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="flex-1 grid place-items-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-400" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100">{translate('errors.viewCrashedTitle')}</h2>
            <p className="text-sm text-slate-400">{translate('errors.viewCrashedHint')}</p>
          </div>
          <pre className="select-text max-h-32 overflow-auto rounded-lg bg-app/60 p-3 text-left text-xs text-rose-300 whitespace-pre-wrap">
            {error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-sm font-semibold text-white"
          >
            <RotateCcw className="w-4 h-4" />
            {translate('common.retry')}
          </button>
        </div>
      </div>
    );
  }
}
