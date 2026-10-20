import '@testing-library/jest-dom/vitest';

// jsdom non implementa matchMedia (usato da settingsStore + Tailwind responsive helpers).
if (typeof window !== 'undefined' && !window.matchMedia) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom non ha IntersectionObserver: alcune dep di react-leaflet/Tailwind lo toccano.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// jsdom non implementa ResizeObserver (Leaflet 1.9+ lo richiede).
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Quota FlyItalyADSB: nessun test deve raggiungere il gateway aerei di
// produzione (che consuma la chiave reale) né il provider. I test che
// simulano la rete sostituiscono fetch con un mock e non passano di qui.
const QUOTA_HOSTS = /(^|\.)aircraft\.alessandropezzali\.it$|(^|\.)flyitalyadsb\.com$/i;
const realFetch = globalThis.fetch?.bind(globalThis);
if (realFetch) {
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      // URL relativo: non è il gateway.
    }
    if (QUOTA_HOSTS.test(host)) {
      console.error(`[test] BLOCCATA richiesta reale verso ${host}`);
      return Promise.reject(new TypeError(`network blocked in tests: ${host}`));
    }
    return realFetch(input, init);
  };
}
