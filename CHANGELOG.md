# Changelog

All notable changes to EarthRadar are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-04

### Added

#### Phase 0 — Bootstrap (PR #1, #2)
- Vite + React 18 + TypeScript scaffold, base path `/EarthRadar/`
- TailwindCSS dark-first with cyan #5cf0ff / magenta #ff5cd0 accents,
  glassmorphism, mobile-first
- React Router with Home / Education / About / RadarMode routes
- Zustand stores (`layersStore`, `settingsStore`) with versioned persist
- i18n IT/EN with browser auto-detect, `<html lang>` sync
- PWA via vite-plugin-pwa (Workbox), `manifest.json`, install prompt
- DisclaimerBanner, Header, Footer, BottomNav (mobile), OnlineBadge

#### Phase 1 — Map2D + USGS earthquakes (PR #2)
- Leaflet 2D map with NASA GIBS base tiles
- USGS GeoJSON real-time feed (`all_day`), severity-color markers
- `apiCache` (idb-keyval) wrapper with TTL + offline fallback files
- Day/night terminator overlay, solar position client-side

#### Phase 2.1 — Satellites (PR #3)
- CelesTrak TLE fetch with group selector (Stations, Starlink, Visual,
  GPS, Galileo, GLONASS, Iridium-NEXT, OneWeb)
- True SGP4 propagation via `satellite.js`, no fake `INCLINATION`/
  `RA_OF_ASC_NODE` mapping (anti-pattern from the legacy project)
- `SatelliteDetailPanel` with orbital elements, live position, deep
  link to CubeSat Constellation

#### Phase 2.2 — Aircraft OpenSky (PR #4)
- ADS-B live states with poll 30 s and rate-limit cooldown badge
- Heading vectors and on-ground filter
- `AircraftDetailPanel` with Flightradar24 deep link

#### Phase 2.3 — Weather + RainViewer radar (PR #5)
- Open-Meteo current + 8-cell directional grid
- RainViewer precipitation tiles with playback controls
- WMO weather code → emoji + severity color mapping

#### Phase 2.4 — NASA EONET (PR #7)
- Multi-geometry events (Point + Polygon + tracks for hurricanes /
  icebergs)
- Track velocity sparkline, category filter, status `open|all`
- `EonetDetailPanel` with NASA source link

#### Phase 2.5 — FIRMS + GIBS Active Fires (PR #9)
- NASA FIRMS NRT hotspots (VIIRS_SNPP, NOAA-20, MODIS) with optional
  `VITE_FIRMS_MAP_KEY`
- GIBS Active Fires fallback overlay when no key is configured
- `FireDetailPanel` with FRP severity, BBOX-aware fetching

#### Phase 2.6 — ISS live + pass predictor (PR #8)
- `wheretheiss.at` live position (poll 10 s) + 1 Hz SGP4 smoothing
- Pass predictor with ENU geometry + sun altitude + ISS sunlit check
  + apparent magnitude estimate
- ICS calendar export (RFC 5545) for the next 5 visible passes
- `IssPanel` with ground-track toggle and CubeSat deep link

#### Phase 2.7 — GIBS overlays effective rendering (PR #10)
- `gibsLayers` registry with `isRealTime` / `staticDate` flags
- Temperature AIRS, aerosol AOD, snow MODIS, sea ice
- Bonus fix: i18n `radar.*` namespace was being shadowed by Radar Mode
  tribute block; added regression guard with raw-text duplicate-key
  detection

#### Phase 2.8 — Lightning MVP (PR #11)
- Static GIBS layer (LIS Mean Flash Rate climatology) — GLM not in
  GIBS catalog, picked LIS as semantically correct fallback
- `LightningDetailPanel` placeholder with v1.1 Blitzortung roadmap

#### Phase 3 — 3D Globe (PR #12)
- `react-globe.gl` + `three` + `globe.gl` lazy chunk (523 KB gzip,
  excluded from PWA precache)
- All data layers reused 1:1 from 2D (same hooks, same fetch cache)
- Adaptive textures via `textureLoader.ts`, perf fallback hook
- Antisolar polygon overlay for day/night
- `Globe3D-*.js` chunk excluded from precache via `globIgnores`

#### Phase 3 hotfix — frame-ticker + CORS textures (PR #13)
- Structural fix for CJS/UMD interop in the 3D dep chain: `frame-ticker`,
  `prop-types`, `react-is`, `simplesignal` forced into
  `optimizeDeps.include`
- `esbuildOptions.mainFields: ['module', 'main']` locked explicitly
- NASA Blue/Black Marble textures hosted locally (518 KB total) to
  bypass CORS on `eoimages.gsfc.nasa.gov`
- 4 sentinel-per-package regression tests + 2 file-existence tests

#### Phase 4 — Polish & deploy (PR #14)
- **Bidirectional deep links** (`src/lib/deepLinkBuilder.ts`):
  `eventToMeteorWatchUrl`, `mapStateToShareUrl`, `parseIncomingShareUrl`
  with strict validation (lat/lon range, zoom 1-18, layer whitelist)
- `useApplyIncomingDeepLink` hook applies the parsed link at boot and
  cleans the query string via `history.replaceState`
- **Web Share API** + clipboard fallback (`src/lib/clipboard.ts`):
  `tryNativeShare` → `copyToClipboard` (clipboard API → execCommand)
- Reusable `<ShareButton>` integrated in Satellite, Aircraft, Weather,
  EONET, Fire, ISS panels + a global one in Home header
- **Notifications opt-in** (`src/lib/notificationsLogic.ts` + 
  `src/hooks/useNotifications.ts`): triggers for M ≥ 5 quakes within
  1000 km and visible ISS passes within 30 min, 30-min cooldown per
  category in localStorage. Split into `useNotificationsControls`
  (light, in Header) and `useNotificationsRunner` (full poll, in Home)
- **A11y polish**: ARIA region labels on `Map2D` + `Globe3D`,
  `motion-reduce` on pulse animations, Globe3D `animateIn` respects
  `prefers-reduced-motion`. Skip-link, focus-visible, reduced-motion
  CSS already present from Phase 0
- `.github/workflows/deploy.yml` — push to `main` runs `npm ci && lint
  && test && build` then deploys to GitHub Pages with CNAME

### Architecture

- 12 services in `src/services/` (one per data source), each with
  `fetch / subscribe / getFallback` + idb-keyval cache
- 13 dedicated chunks for lazy-imported components (one per layer +
  Globe3D)
- Workbox runtime caching for 12+ origins with per-API strategies
  (`StaleWhileRevalidate` for slow-changing, `NetworkFirst` with 4 s
  timeout for live, `CacheFirst` for tiles/textures)
- `react/react-dom` + `three` deduped via `resolve.dedupe` + forced
  pre-bundle in `optimizeDeps.include` (Phase 0 hotfix #6)

### Performance

- Home initial JS: **61 KB gzip**
- Globe3D lazy chunk: **523 KB gzip** (mai eager, on-demand al toggle)
- PWA precache: **800 KB** (texture + Globe3D escluse di proposito)
- Build time: ~2.5 s on cold cache
- 8 K textures rejected to keep the repo lean — 2 K equirectangular
  is enough for spherical rendering up to L1

### Tests

**285+ test verdi** through Vitest (4.x):
- Pure logic: `quakeFormatters`, `wmoCodes`, `geo`, `apiCache`,
  `dayNightTerminator`, `sgp4Lite`, `passPredictor`, `icsExporter`,
  `gibsLayers`, `eonetCategories`, `firmsApi`, `notificationsLogic`,
  `clipboard`, `deepLinkBuilder`, `buildShareUrl`, `textureLoader`,
  `fpsMonitor`
- Stores: `layersStore`, `settingsStore`
- Hooks: `useApplyIncomingDeepLink`, `useNotificationsControls`
- Components: `Home` smoke, `Layout` a11y baseline, `Globe3D` import
  smoke + sentinel
- Sentinel guards:
  - i18n duplicate top-level namespace detection (anti regression
    da Fase 2.7)
  - CJS/UMD interop watchdog (anti regression da Fase 3 hotfix)
  - CORS regression guard (anti regression da Fase 3 hotfix)

[1.0.0]: https://github.com/pezzaliapp/EarthRadar/releases/tag/v1.0.0
