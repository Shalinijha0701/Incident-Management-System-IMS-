import React from 'react';

/**
 * A simple error boundary that catches rendering errors in its children
 * and displays a fallback UI. This prevents the entire app from
 * crashing with a white screen if an exception occurs during rendering.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1rem', color: 'red' }}>
          <h2>Something went wrong.</h2>
          <p>{String(this.state.error)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;