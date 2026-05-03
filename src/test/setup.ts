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
