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

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
