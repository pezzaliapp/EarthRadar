# Changelog

All notable changes to EarthRadar are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.4] — 2026-08-18

Patch release. Ottimizzazione UX Home «map-first» su smartphone portrait.
Nessuna nuova dipendenza, zero costi, nessuna modifica a Anomalia/routing/PWA/
coordinate/bottom navigation.

### Changed

- **Home compatta su smartphone** (`src/pages/Home.tsx`): l'hero (titolo grande
  + paragrafo intro + banner «fase 1») era alto ~200 px e spingeva la mappa
  sotto la piega, costringendo a scorrere per raggiungere mappa e controlli. Ora
  su mobile l'hero mostra solo il **titolo (più piccolo) con il toggle 2D/3D
  inline**; intro e avviso «fase 1» restano visibili da `sm+` (tablet/desktop,
  esperienza invariata). L'altezza della mappa passa a **62vh su mobile** (era
  70vh: su iOS Safari il 70vh è calcolato sul viewport "large" ed eccedeva lo
  spazio visibile) restando **70vh su desktop**. Risultato: su iPhone portrait
  mappa e controlli overlay (zoom, «apri pannello layer», chip radar) sono
  immediatamente visibili senza scorrere.
- Il pannello RainViewer resta **collassato di default** su smartphone (chip
  «🌧 Radar pioggia», introdotto in 1.2.3), confermato dai test.

## [1.2.3] — 2026-08-18

Patch release. Ottimizzazione UX mobile del pannello radar precipitazioni.
Nessuna nuova dipendenza, zero costi, nessuna funzionalità rimossa.

### Changed

- **RainViewer collassabile su smartphone** (`src/components/panels/RainRadarControls.tsx`):
  in portrait (e in landscape a schermo basso) il pannello «Radar precipitazioni
  RainViewer» partiva sempre aperto e copriva gran parte della mappa,
  costringendo a scorrere o a ruotare il telefono. Ora su smartphone parte
  **collassato** come chip compatto «🌧 Radar pioggia» ancorato in basso a
  destra; un tocco apre il pannello completo (play/pausa, timeline, tempo
  relativo, opacità, **attribuzione RainViewer obbligatoria**), richiudibile con
  ✕. Su tablet/desktop resta aperto di default (esperienza invariata). Il chip
  è in basso a destra, il pulsante «Apri pannello layer» in alto a destra: non
  si sovrappongono. Touch target ≥ 44 px, safe-area rispettata, larghezza
  vincolata alla viewport (`max-w-[calc(100%-1rem)]`, nessun overflow X),
  nessuna interferenza con la bottom navigation. Nessuna funzione RainViewer
  rimossa.

## [1.2.2] — 2026-08-18

Patch release. Corregge due bug post-deploy distinti. Nessuna nuova dipendenza,
zero costi.

### Fixed

- **Home — «Invalid LatLng object: (NaN, NaN)»** (`src/lib/sgp4Lite.ts`,
  `src/utils/coords.ts` + guardie nei layer/store). Causa alla radice:
  `geodeticFromSatrec` restituiva `{lat, lon}` senza verificare `Number.isFinite`,
  quindi un TLE stale/decaduto produceva coordinate `NaN` consegnate come oggetto
  non-null; il consumer ISS (`smoothLat ?? null`) le lasciava passare perché
  `NaN` non è `null`, e la guardia `smoothLat === null` non le intercettava →
  `<Marker position={[NaN, NaN]}>` → eccezione Leaflet. Ora:
  - la propagazione SGP4 ritorna `null` (mai coordinate non finite);
  - nuova utility `coords.ts` (`isValidLat/Lon/LatLon`, `sanitizeCenter`,
    `filterValidLatLng`) applicata a **tutti** i confini Leaflet: ISS, satelliti,
    aerei, EONET, terminatore, `flyTo` della Home, centro `Map2D`;
  - lo store rifiuta centri e posizioni GPS non validi (NaN, undefined, fuori
    range) e sanitizza le coordinate legacy persistite da versioni precedenti;
  - la mancata disponibilità/negazione/scadenza del GPS non manda più in crash
    la Home: fallback sicuro (Reggio Emilia) o stato neutro.
- **Route `/anomaly` → 404 su GitHub Pages** (`public/404.html`, `index.html`,
  `src/lib/spaRedirect.ts`). L'accesso diretto o il refresh su una route React
  (es. `/EarthRadar/anomaly`) restituiva il 404 di GitHub Pages: il server
  statico non conosce la route e `navigateFallback` del service worker non può
  intervenire prima che il SW sia attivo. Soluzione: fallback SPA standard per
  GitHub Pages (tecnica spa-github-pages), che **mantiene gli URL puliti** e non
  richiede alcuna modifica al router:
  - `public/404.html` riscrive la route in `/EarthRadar/?/<route>` e ricarica
    index.html (file reale, 200);
  - uno snippet inline in `index.html` (eseguito prima del bundle) decodifica il
    path pulito prima che React Router parta — nessun reload, nessun loop;
  - logica pura testabile in `spaRedirect.ts`.
  URL finale invariato: `https://www.alessandropezzali.it/EarthRadar/anomaly`.

## [1.2.1] — 2026-08-18

Patch release. Correzione robusta dell'aggiornamento PWA: dopo una nuova
release gli utenti non restano più bloccati con HTML/chunk/service worker di
versioni diverse. Nessuna nuova dipendenza, zero costi.

### Fixed

- **Aggiornamento PWA / chunk obsoleti** (`src/lib/pwaUpdate.ts`,
  `src/main.tsx`, `src/components/common/ErrorBoundary.tsx`): il service worker
  `autoUpdate` (skipWaiting + clientsClaim + cleanupOutdatedCaches) poteva
  attivare la nuova build a metà sessione e cancellare la vecchia precache
  mentre la pagina "vecchia" era ancora in esecuzione; il successivo import di
  un chunk con hash precedente falliva con «Importing a module script failed»
  (iOS Safari) / «Failed to fetch dynamically imported module» (Chromium),
  perché il `registerSW.js` iniettato registrava soltanto il SW senza alcuna
  logica di reload. Ora:
  - al `controllerchange` (nuovo SW che prende il controllo) viene eseguito
    **un solo reload controllato** — mai al primo install;
  - gli errori di import dinamico innescano **un solo reload** guardato da
    `sessionStorage` con cooldown anti-loop; un normale errore runtime NON
    provoca reload;
  - `ErrorBoundary` distingue i chunk obsoleti (placeholder «Aggiornamento…» +
    reload automatico) dai crash reali (UI d'errore invariata);
  - viene inoltre gestito l'evento Vite `vite:preloadError`.
  L'aggiornamento resta automatico e non richiede all'utente di svuotare cache,
  reinstallare la PWA o cancellare Safari. Nessuna perdita della modalità
  offline.

## [1.2.0] — 2026-08-18

Feature release. Nuova sezione **Anomalia Sismica** (`/anomaly`) e correzione
strutturale definitiva della bottom navigation mobile. Zero nuove dipendenze,
zero costi: la funzione usa esclusivamente dati pubblici e gratuiti USGS.

### Added

- **Anomalia Sismica** (`src/pages/SeismicAnomaly.tsx`): risponde
  quantitativamente alla domanda «l'attività sismica attuale è statisticamente
  diversa dalla storia recente?». Confronta la sismicità osservata (query live
  USGS FDSN) con una baseline storica 2006–2025, senza mai forzare conclusioni
  né prevedere terremoti. Quattro esiti: nella norma / superiore alla media /
  statisticamente insolito / dati insufficienti.
- **Baseline storica riproducibile** (`scripts/generateSeismicBaseline.mjs` →
  `public/data/seismic-baseline.json`, ~10 KB): conteggi annuali, energia e
  distribuzioni di finestre mobili (30/60/90 giorni) per soglie M≥5.5/6.0/7.0,
  derivate solo da USGS. 9827 eventi M≥5.5 aggregati. Rigenerabile con
  `npm run baseline`. Nessun declustering: catalogo integro, con nota aftershock.
- **Libreria statistica** (`src/lib/seismicStats.ts`, `seismicAnalysis.ts`):
  media, mediana, deviazione standard di popolazione, percentile empirico
  (mid-rank), z-score accessorio, energia Gutenberg–Richter
  (E = 10^(1.5·M+4.8) J), classificazione dello scostamento e diagnostica
  (non distruttiva) delle sequenze di aftershock.
- **Grafici SVG nativi** (`src/pages/anomaly/AnomalyCharts.tsx`): attuale vs
  storico, andamento annuale, energia sismica, distribuzione per classe di
  magnitudo. Nessuna libreria di charting.
- **Pannelli educativi** «Come leggere questi dati» e «Metodo», più disclaimer
  specifico di non-previsione. Contenuti IT/EN completi (chiave `anomaly.*`).
- Nuova voce di navigazione **Anomalia** (header desktop + bottom nav mobile).

### Fixed

- **Bottom navigation mobile**: rimosso `transform: translateZ(0)` dal `body`
  in `index.css`, che creava un containing block per gli elementi
  `position: fixed` e faceva attraversare la barra al centro della viewport
  durante lo scroll. La barra ora è realmente ancorata al fondo della viewport,
  con `env(safe-area-inset-*)` su tutti i lati e unità viewport moderne
  (`100dvh`) per l'altezza a schermo pieno. Padding contenuti safe-area aware
  (`.pb-safe-nav`). Target touch ≥ 44 px, nessuna regressione desktop.

### Notes

- Vulnerabilità dipendenze invariate rispetto alla bonifica precedente (le
  residue richiedono migrazioni major deliberatamente rimandate: React Router 7,
  Vite 8, Vitest 4, vite-plugin-pwa 1).

## [1.1.0] — 2026-05-10

Feature release. La pagina `/education` smette di essere un placeholder e
diventa l'hub divulgativo dell'app — cinque sezioni navigabili, ~5000 parole
di contenuti scritti nella voce del blog «La Terra, addosso», tradotte in
inglese mantenendo registro e metafore. Pipeline verde (lint + 355 test, +9
nuovi smoke).

### Added

- **Pagina Educa completa** (`src/pages/Education.tsx`): cinque sezioni
  hash-anchored (`#layers`, `#glossary`, `#tutorials`, `#sources`,
  `#extra`) con sticky sidebar verticale su desktop e tab orizzontali
  scrollabili su mobile/tablet. Lazy-loaded come chunk separato
  (`Education-*.js` ≈ 16 kB / 4 kB gzip).
- **Layer dell'app**: nove schede divulgative — Terremoti USGS, Satelliti
  CelesTrak, ISS Live, Aerei OpenSky, Incendi NASA FIRMS, Eventi naturali
  EONET, Mappe NASA GIBS, Radar precipitazioni RainViewer, Meteo
  Open-Meteo. Ognuna con quattro blocchi: cosa è, da dove viene, come si
  interpreta, limiti. Componente riusabile `LayerEducationCard.tsx`.
- **Glossario**: ~25 termini espandibili con search case-insensitive,
  ordinamento alfabetico, link Wikipedia opzionale. Termini coperti:
  Apogeo/Perigeo, AOD, Bolide, Effemeride, Eccentricità, FRP, GNSS,
  LEO/MEO/GEO/HEO, Hotspot, Inclinazione, Magnitudine apparente / scala
  Richter, NORAD CAT ID, profondità ipocentrale, SGP4, Terminator, TLE,
  Codici WMO, WMTS / WMS, ADS-B, Epoch, Periodo orbitale, Tsunami.
  Componente `GlossaryItem.tsx` con accordion + aria-expanded.
- **Tutorial**: quattro mini-guide pratiche con stepper numerato e
  screenshot column con onError fallback. Tutorial: trovare la ISS,
  capire un terremoto, identificare un satellite, vedere arrivare un
  temporale. Componente `TutorialCard.tsx`. Cartella
  `public/screenshots/edu/` come placeholder per gli asset PNG (drop-in,
  niente rebuild necessario).
- **Sorgenti dati**: 11 provider con licenza, frequenza di aggiornamento,
  citation accademica espandibile (NASA Worldview/GIBS, EONET, FIRMS,
  Visible Earth, USGS Earthquake, NOAA GOES, CelesTrak, OpenSky,
  Open-Meteo, RainViewer, wheretheiss.at). Componente
  `DataSourceCard.tsx`.
- **Extra**: card Radar Mode tributo spostata qui dalla vecchia
  Education legacy, con riga di contesto sul perché esiste.
- **i18n IT/EN completa** per tutti i contenuti educativi: ~5000 parole
  per lingua sotto `education.*`. La voce traduce le metafore concrete
  del blog «La Terra, addosso» (NORAD 16882, antenne da venti euro,
  zio col telescopio, in pigiama in cortile) preservandone tono e
  ritmo anche in inglese.

### Changed

- `/education` non è più un placeholder. La vecchia card "Radar Mode
  tributo" linkata direttamente sulla Education page è stata spostata
  nella nuova sezione Extra con un paragrafo di motivazione.

### Tests

- 9 nuovi smoke test in `src/pages/education/Education.test.tsx`:
  presenza delle 5 sezioni, 9 LayerCard, 11 DataSourceCard; glossary
  search filtra correttamente; messaggio no-results su query
  inesistente; tutti e 4 i blocchi educativi presenti in
  `LayerEducationCard`; toggle aria-expanded di `GlossaryItem`;
  step switching con aria-expanded coerente in `TutorialCard`;
  citation `DataSourceCard` nascosta di default e svelata al click.
- Suite passata da 346 → 355 test. Lint pulito.

---

## [1.0.2] — 2026-05-04

Hotfix UX: ripristina la parità di controlli fra vista 2D e vista 3D. Nessuna
feature nuova. Pipeline verde (lint + 346 test, +3 nuovi smoke).

### Fixed

- **Globe3D**: il pannello Layer ora è visibile anche in vista 3D
  (regressione introdotta in Fase 3). Causa root: `react-globe.gl` (via
  `three-render-objects`) usa di default `window.innerWidth` /
  `window.innerHeight` come dimensioni del canvas. Senza `width`/`height`
  espliciti, il canvas (~1920×1080) gonfiava la min-content della grid
  column `1fr` della Home, spingendo la colonna `LayerPanel` (320px) fuori
  viewport. Il fix passa dimensioni reali al `<Globe>` via `ResizeObserver`
  e indurisce la grid con `minmax(0,1fr)` + `min-w-0` sull'item.
- **Globe3D**: lo stato dei layer attivi è preservato quando si commuta fra
  Mappa 2D e Globo 3D (già garantito da `layersStore` con Zustand persist,
  ora coperto da test).

### Tests

- 3 nuovi smoke test in `src/pages/Home.layerPanel.test.tsx`:
  - LayersPanel presente nel DOM con `viewMode: '2d'`
  - LayersPanel presente nel DOM con `viewMode: '3d'` (era questo il caso
    che mancava)
  - Toggle di un layer in 2D resta attivo dopo switch a 3D (persistenza
    cross-view via store)

---

## [1.0.1] — 2026-05-04

Patch release: easter egg "Radar Mode" attivato, manutenzione CI e UX
mobile. Nessuna feature pesante e nessun refactoring strutturale —
tutta la pipeline lint + test + build resta verde (343 test).

### Added

- **Radar Mode tributo (Phase 5 strict optional)** — `src/pages/RadarMode.tsx`
  attiva la rotta `/radar-mode`. PPI verde fosforo con sweep rotante
  (10 s/giro), centrato su geolocalizzazione opt-in o centro mappa
  corrente. Plot in real-time di:
  - terremoti USGS (raggio = magnitudo)
  - satelliti CelesTrak gruppi `stations` + `visual` propagati SGP4 al frame
  - aerei OpenSky (toggle opt-in per non saturare il rate-limit)
- Range selezionabile 100 / 500 / 1000 / 5000 km, ring concentriche
  con scala km, lance cardinali N/E/S/W
- Audio "ping" opzionale (off di default) — WebAudio API, beep sinusoidale
  880 Hz con cooldown 200 ms anti-cacofonia, triggera quando lo sweep
  attraversa il bearing del target
- `prefers-reduced-motion`: sweep statico + audio disabilitato in automatico
- Disclaimer dedicato "Visualizzazione tributo. Non sostituisce sistemi
  reali di sismologia, navigazione aerea o difesa planetaria."
- Link Radar Mode in Footer, Header desktop, BottomNav mobile (4-col),
  card promo nella pagina Education
- `src/lib/radarPolar.ts` — proiezione lat/lon → polare (range/bearing),
  `polarToCanvas`, `isSwept` con gestione wrap, `filterInRange`,
  `RADAR_RANGES`. Coperto da 20 nuovi test in `radarPolar.test.ts`

### Fixed

- **CI Node.js 22**: `actions/setup-node@v4` con `node-version: '22'` per
  silenziare i warning di deprecation di GitHub Actions su Node 20
- **Touch target ≥ 44 × 44 px** (Apple HIG): regola `@media (pointer: coarse)`
  in `index.css` che porta le label-row del pannello layer a `min-height:
  44px`, allarga lo slider opacità (track 32 px, thumb 22 × 22) e i
  checkbox a 18 × 18 — solo su touch, desktop resta compatto
- **Overflow orizzontale safety net**: `html, body { max-width: 100vw;
  overflow-x: clip; }` per evitare scrolling laterale su iPhone SE
  (375 px) in caso di overflow imprevisti

### Security / Operations

- **Rotazione MAP_KEY FIRMS personale**: la key precedentemente esposta
  in chat va rigenerata individualmente. README EN/IT include nuova
  sezione "Local setup — FIRMS map key" con i passi per il rilascio
  gratuito su <https://firms.modaps.eosdis.nasa.gov/api/map_key/>,
  raccomandazione esplicita di non committare la propria key, e
  conferma che il deploy in produzione su GitHub Pages **non** include
  alcuna key (frontend statico, ognuno usa la sua). `.env.example`
  aggiornato con commento esteso. Il fallback automatico a
  `GibsFiresOverlay` quando `VITE_FIRMS_MAP_KEY` è vuota era già in
  place da v1.0.0 e resta invariato

### i18n

- Nuova sezione `radarMode.{intro, rangeLabel, rangeKm, centerLabel,
  centerGps, centerMap, useMyLocation, useMapCenter, audioToggle,
  audioOn, audioOff, showAircraft, aircraftHint, reducedMotionNotice,
  legendQuakes/Satellites/Aircraft/Center, stats, tributeBadge,
  disclaimer, loading, noLocation}` in IT e EN. Il placeholder
  precedente `radarMode.placeholder` è stato sostituito dalla feature
  reale e rimosso (test `i18n.test.ts` aggiornato di conseguenza)

### Bundle

- Chunk `RadarMode-*.js`: 11.20 KB / **3.85 KB gzip** (lazy, caricato
  solo navigando alla rotta)
- Nessun impatto sul bundle Home / Globe3D

### Tests

- **343 test verdi** (era 311) — +20 in `radarPolar.test.ts` (toPolar,
  polarToCanvas su tutti i quadranti, isSwept con gestione wrap,
  filterInRange con coordinate non finite, RADAR_RANGES sanity), +12
  da espansione `i18n.test.ts` sulle nuove chiavi `radarMode.*`

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

[1.0.1]: https://github.com/pezzaliapp/EarthRadar/releases/tag/v1.0.1
[1.0.0]: https://github.com/pezzaliapp/EarthRadar/releases/tag/v1.0.0
