import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center min-h-screen p-8">
            <div className="text-center">
              <p className="text-red-600 font-medium">오류가 발생했습니다.</p>
              <p className="text-sm text-gray-500 mt-1">{this.state.error?.message}</p>
              <button
                className="mt-4 px-4 py-2 text-sm bg-gray-100 rounded hover:bg-gray-200"
                onClick={() => this.setState({ hasError: false })}
              >
                다시 시도
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
