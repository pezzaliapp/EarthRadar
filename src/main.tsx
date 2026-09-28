import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import {
  registerServiceWorker,
  setupPreloadErrorReload,
  setupReleaseCheck,
  setupServiceWorkerAutoReload,
} from './lib/pwaUpdate';

// iOS viewport hack for --vh
function setVh() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
setVh();
window.addEventListener('resize', setVh);
window.addEventListener('orientationchange', setVh);

// Aggiornamento PWA robusto: reload controllato quando il nuovo service worker
// prende il controllo (autoUpdate + skipWaiting/clientsClaim) e rete di
// sicurezza contro i chunk obsoleti della build precedente. Vedi lib/pwaUpdate.
setupServiceWorkerAutoReload();
setupPreloadErrorReload();
if (import.meta.env.PROD) {
  // Service worker di questa build (URL versionato) e controllo nuove release
  // al ritorno in primo piano. Solo in produzione: in dev non esiste sw.js.
  registerServiceWorker();
  setupReleaseCheck();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/EarthRadar">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
