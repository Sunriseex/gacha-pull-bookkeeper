import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error) { console.error('Dashboard failed', error); }
  render() {
    if (this.state.error) return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Unable to load the calculator</h1><p className="my-4">Your saved preferences are still available. Try reloading the page.</p><button className="rounded border p-3" onClick={() => location.reload()}>Reload page</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
