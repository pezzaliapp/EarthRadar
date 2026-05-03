/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/EarthRadar/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'EarthRadar — PezzaliAPP',
        short_name: 'EarthRadar',
        description: 'La Terra dallo spazio in tempo reale. Tutto quello che si muove sopra e sotto la superficie, live.',
        theme_color: '#0b1020',
        background_color: '#05070f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/EarthRadar/',
        scope: '/EarthRadar/',
        lang: 'it',
        categories: ['education', 'science', 'utilities', 'navigation'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
        // Escludiamo il chunk Globe3D dal precache: pesa ~523 KB gzip
        // (three + react-globe.gl + globe.gl) e l'utente 2D non deve pagarlo
        // all'install. Quando l'utente clicca "Globo 3D" il chunk viene
        // scaricato on-demand e poi caduto in runtime cache via SW.
        globIgnores: ['**/Globe3D-*.js'],
        navigateFallback: '/EarthRadar/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
        // Pre-cache budget bumped because of three.js + leaflet + globe textures.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/earthquake\.usgs\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'usgs-quakes',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.nasa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nasa-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 6 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/eonet\.gsfc\.nasa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nasa-eonet',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/firms\.modaps\.eosdis\.nasa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nasa-firms',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/gibs\.earthdata\.nasa\.gov\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nasa-gibs-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/celestrak\.org\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'celestrak-tle',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 6 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/opensky-network\.org\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'opensky-states',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'open-meteo',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 15 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(?:api|tilecache)\.rainviewer\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'rainviewer',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 10 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.wheretheiss\.at\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'iss-live',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(?:visibleearth|eoimages)\.(?:nasa|gsfc\.nasa)\.gov\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nasa-visibleearth',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z0-9.-]*\/(?:fallback-data)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fallback-data',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // three: react-globe.gl pretende una singola istanza.
    // react/react-dom: hotfix per "Cannot read properties of null (reading 'useState')"
    // — react-kapsule (dep transitiva di react-globe.gl) aveva pre-bundlato una sua
    // copia di React, e gli hook chiamati da @ts/react finivano su un client diverso.
    dedupe: ['three', 'react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    // Forziamo il pre-bundle di tutto lo stack React+routing+map nello stesso
    // chunk, così esiste UNA sola istanza di react/react-dom in dev.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react-router-dom',
      'react-leaflet',
      'leaflet',
      'zustand',
      'zustand/middleware',
      // frame-ticker@1.0.3 è un bundle UMD legacy senza `module`/`exports`/
      // `type:module` nel suo package.json. È l'unica dep di three-globe a
      // non essere ESM nativa. Quando three-globe (excluded) la importa,
      // Vite la carica raw come ESM e fallisce con
      //   "does not provide an export named 'default'"
      // Il fix è forzarne il pre-bundle: Vite la trasforma in ESM con
      // default export interop. Lo facciamo qui (non in `exclude`) perché
      // frame-ticker è una piccola lib utility, non parte del bundle 3D
      // pesante che vogliamo isolare.
      'frame-ticker',
    ],
    // Le dep 3D restano fuori dal pre-bundle: vengono caricate solo dai chunk
    // lazy della Fase 3 (Globe3D) e non devono toccare l'entry della Home.
    exclude: ['react-globe.gl', 'three', 'globe.gl'],
  },
  build: {
    sourcemap: false,
    // Globe3D pesa ~1.85 MB minified per il bundle three+react-globe.gl. È
    // lazy + escluso dal precache PWA: il warning non aggiunge informazione
    // utile, lo alziamo a 2 MB per silenziarlo senza nascondere altri chunk
    // potenzialmente problematici.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
