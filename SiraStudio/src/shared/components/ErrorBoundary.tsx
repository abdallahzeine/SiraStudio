import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ui] document boundary caught runtime error', error, info);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <section className="mx-auto my-6 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h2 className="text-base font-semibold">Document preview failed</h2>
          <p className="mt-2 text-sm">
            An unexpected rendering error occurred in the editor/print region. Toolbar controls remain available.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-red-100"
            onClick={this.handleReset}
          >
            Retry document render
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
