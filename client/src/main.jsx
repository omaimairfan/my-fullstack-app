import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('TaskFlow render error:', error); }
  render() {
    if (this.state.error) return <div className="fatal-error"><div><h1>TaskFlow couldn’t start</h1><p>{this.state.error.message}</p><button onClick={() => location.reload()}>Try again</button></div></div>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
