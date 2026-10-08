import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/public-sans/800.css';
import './styles/tokens.css';
import './styles/app.css';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QuickAddFlyout } from './quick-add/QuickAddFlyout';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// The menu-bar flyout (D51) is the same bundle opened at #quick-add.
const flyout = window.location.hash === '#quick-add';
if (flyout) {
  document.title = 'Quick add';
  document.body.classList.add('qa-window');
}

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>{flyout ? <QuickAddFlyout /> : <App />}</ErrorBoundary>
  </React.StrictMode>,
);
