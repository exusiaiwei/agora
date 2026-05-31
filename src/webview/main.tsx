import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
