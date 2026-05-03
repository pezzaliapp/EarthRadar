# CLAUDE.md — EarthRadar

Guidance for Claude Code when working in this repository.

## Scope

**EarthRadar** è una PWA della serie PezzaliAPP, sister app di **MeteorWatch** (https://github.com/pezzaliapp/MeteorWatch) e **CubeSat Constellation** (https://github.com/pezzaliapp/CubeSat_Constellation).

Risponde alla domanda: *"Cosa sta succedendo sulla Terra adesso?"*

Tagline: **La Terra dallo spazio in tempo reale.** Tutto quello che si muove sopra e sotto la superficie, live.

Strumento divulgativo per appassionati di scienze della Terra, divulgatori, studenti, curiosi e osservatori. **NON sostituisce** sistemi ufficiali di protezione civile, navigazione aerea, sismologia, meteorologia operativa o difesa planetaria.

Copre:
- 🌍 Terremoti USGS (real-time GeoJSON)
- 🛰️ Satelliti con propagazione SGP4 vera (CelesTrak TLE + satellite.js)
- ✈️ Traffico aereo OpenSky live
- 🌦️ Meteo Open-Meteo + layer radar precipitazioni
- 🔥 Incendi attivi NASA FIRMS (e/o GIBS Active Fires senza key)
- 🌪️ Eventi naturali NASA EONET (uragani, eruzioni, iceberg, alluvioni)
- ☁️ Overlay GIBS (nuvole GOES, temperatura, aerosol/AOD, neve, ghiaccio)
- ⚡ Fulmini live (best-effort: Blitzortung mirror o GIBS GOES-GLM)
- 🌑 Terminatore giorno/notte e linea grigia
- 🌐 Vista 2D (Leaflet + tile NASA GIBS) **e** vista 3D (Globe stile NASA)

## Stack scelto e motivazioni (NON ridiscutere)

| Tecnologia | Motivazione |
|------------|-------------|
| **React 18 + Vite + TypeScript** | Coerenza con MeteorWatch, type safety, HMR, build veloci |
| **TailwindCSS dark-mode-first** | Design system condiviso con MeteorWatch e CubeSat |
| **Leaflet + react-leaflet** | Mappa 2D leggera con tile NASA GIBS, no token, OSS |
| **react-globe.gl** *(default)* | Globo 3D dichiarativo basato su three.js, ~150 KB, texture NASA come material. Valutare Cesium/Resium solo se serve precisione orbitale e occlusion realistica — documentare la scelta qui se cambia |
| **Zustand + persist** | State management minimale, niente boilerplate Redux |
| **idb-keyval** | Cache IndexedDB key/value (più semplice di Dexie) |
| **satellite.js** | SGP4/SDP4 client-side per satelliti e ISS |
| **date-fns** | Timezone-aware, tree-shakable, multi-locale |
| **react-router-dom v6** | Routing standard con `basename="/EarthRadar"` |
| **vite-plugin-pwa (Workbox)** | Manifest, SW autoUpdate, runtime caching declarativo |
| **vitest** | Test logica pura (formatters, propagazione, deep link) |

## Convenzioni di commit

Conventional Commits in italiano/inglese:

- `feat:` nuova feature
- `fix:` bug fix
- `chore:` manutenzione, build, deps
- `docs:` documentazione
- `refactor:` refactor senza cambio comportamento
- `style:` formattazione
- `test:` test
- `release:` rilascio versionato

Esempi:
- `feat: aggiungi globo 3D con texture NASA Blue Marble`
- `feat: integra layer FIRMS con MAP_KEY opzionale`
- `fix: correggi propagazione SGP4 quando il TLE è stale`
- `release: v1.0.0 — initial public release`

## Permessi pre-approvati

I seguenti comandi sono autorizzati senza chiedere conferma all'utente, **solo dentro la cartella di progetto** (`/Users/alessandropezzali/EarthRadar/`):

- `npm`, `npx`, `node`
- `git`, `gh`
- `vite`, `tsc`
- `eslint`, `prettier`
- `vitest`
- `mkdir`, `touch`, `cat`, `ls`, `mv`, `cp`, `rm` (solo all'interno della cartella di progetto)

## Fetch consentiti

- `api.nasa.gov`
- `ssd-api.jpl.nasa.gov`
- `eonet.gsfc.nasa.gov`
- `firms.modaps.eosdis.nasa.gov`
- `gibs.earthdata.nasa.gov`
- `epic.gsfc.nasa.gov`
- `earthquake.usgs.gov`
- `celestrak.org`
- `opensky-network.org`
- `api.open-meteo.com`
- `api.wheretheiss.at`
- `api.rainviewer.com`
- `tilecache.rainviewer.com`
- `tile.openstreetmap.org`
- `visibleearth.nasa.gov`
- `eoimages.gsfc.nasa.gov`
- `registry.npmjs.org`

## Workflow operativo — preferenze utente

### Documentazione → push diretto su main pre-approvato
Per modifiche che riguardano SOLO file di documentazione, commit
e push diretto su `main` sono pre-approvati.

File coperti: `docs/**`, `README.md`, `CHANGELOG.md`, `ANALISI_INIZIALE.md`, `CLAUDE.md`, `LICENSE`, `CONTRIBUTING.md` di root, file `.md` di documentazione in genere.

### Codice → sempre via branch + PR
Per qualsiasi modifica a codice o configurazioni dell'app usare sempre branch dedicato + Pull Request:
- `src/**`, `public/**`, `scripts/**`
- Configurazioni: `vite.config.ts`, `package.json`, `tsconfig*.json`, `tailwind.config.*`, `eslint.config.*`, `.prettierrc*`
- Workflow CI/CD: `.github/**`

### In caso di modifica mista (docs + codice)
Trattare l'intero set come "codice" → branch + PR.

### File privati di marketing/comunicazione
NON committare nel repo pubblico. Tenere in `~/EarthRadar-private/` o in `/docs/private/` (coperto da `.gitignore`). Mai committare `*.private.md`, `drafts/`, `marketing/`.

## Decisioni architetturali (NON ridiscutere)

1. **Base path**: `/EarthRadar/` per Vite, manifest, router, SW. Deploy target `https://www.alessandropezzali.it/EarthRadar/`.
2. **PWA scope**: `/EarthRadar/` con `start_url` corrispondente.
3. **Service Worker** (vite-plugin-pwa):
   - StaleWhileRevalidate per API NASA/USGS/CelesTrak (TTL diversi)
   - NetworkFirst per OpenSky e ISS live (timeout 4s)
   - CacheFirst per fallback data e tile GIBS
   - navigateFallback per SPA routing offline
4. **Cache layer applicativo**: ogni servizio passa da `lib/apiCache.ts` (idb-keyval) con TTL e fallback offline. Doppia protezione (SW + idb-keyval). Pattern identico a MeteorWatch.
5. **API key NASA**: `VITE_NASA_API_KEY` con fallback `DEMO_KEY`. **FIRMS** richiede `VITE_FIRMS_MAP_KEY`; se assente, usare GIBS Active Fires (no key) come fallback automatico e mostrare avviso.
6. **Calcoli orbitali**: `satellite.js` lato client per propagazione SGP4 reale dei satelliti CelesTrak (non più la mappatura finta INCLINATION/RA_OF_ASC_NODE del progetto vecchio). Ground track 90 min.
7. **Vista 2D vs 3D**: toggle in header globale, persistito in `settingsStore`. Default mobile = 2D, default desktop = 3D. Sempre commutabile dall'utente.
8. **Layer dati**: ognuno è un service in `services/`, ciascuno espone `fetch()`, `subscribe()` (per live), `getFallback()`. Lista layer attivi gestita da `layersStore` (Zustand persist). UI: pannello laterale stile MeteorWatch + bottom sheet su mobile.
9. **Sister app deep link** (`lib/deepLinkBuilder.ts`):
   - **EarthRadar → MeteorWatch**: `https://www.alessandropezzali.it/MeteorWatch/?event=<type>&id=<id>` (type: `neo|fireball|reentry|iss`)
   - **EarthRadar → CubeSat**: `https://pezzaliapp.github.io/CubeSat_Constellation/?tle=<base64TLE>&name=<name>` (riusa schema esistente)
   - **MeteorWatch → EarthRadar**: `?lat=<x>&lon=<y>&layer=<id>&date=<iso>` per centrare la mappa
   - **CubeSat → EarthRadar**: `?norad=<id>&layer=satellites` per evidenziare un satellite
   - Footer di tutte e tre le app: cross-link reciproco verso le sister app.
10. **i18n**: file JSON in `src/i18n/{it,en}.json`, lingua di default = browser, fallback IT, sync `<html lang>`. Stessa identica pipeline di MeteorWatch.
11. **Geolocalizzazione**: opt-in via `useGeolocation`. Fallback Reggio Emilia (lat 44.698, lon 10.631) per omaggio al progetto originale, override Roma se preferito.
12. **Disclaimer**: banner persistente + modale al primo accesso. Fonte dati visibile in ogni layer ("Powered by USGS / NASA GIBS / OpenSky / ...").
13. **Notifiche**: opt-in. Triggers minimi al lancio (terremoti M>=5 vicini, ISS pass visibile). Anti-spam log in localStorage (cooldown 30 min).
14. **Stile**: dark-space (nero/blu notte profondo), accenti **ciano (#5cf0ff)** e **magenta (#ff5cd0)** coerenti con MeteorWatch, semaforo verde/giallo/rosso per severità eventi, font monospace (JetBrains Mono fallback) per dati tecnici, glassmorphism su card e header. Mobile-first con fix iOS (`--vh` hack, `apple-mobile-web-app-capable`).
15. **Footer**: link a MeteorWatch, CubeSat Constellation, pezzaliapp.com, GitHub. Label "PezzaliAPP — EarthRadar".
16. **Modalità "Radar Polare"** (eredità del progetto originale): liberamente decisa da Claude Code. Suggerimento: tab/scena alternativa "Radar Mode" che ricicla l'estetica vintage verde fosforo del canvas originale come easter egg/tributo. Se diventa troppo costosa, scartare e annotare in CHANGELOG.
17. **GitHub Action**: deploy automatico su `gh-pages` al push su `main`. CNAME = `www.alessandropezzali.it`.
18. **Testing**: Vitest per logica pura (formatters, deep link, propagazione SGP4 wrapper, riskCalculator terremoti).
19. **Lint + Build prima di ogni commit** è policy. `npm run lint` e `npm run build` devono passare.

## Script npm

```
dev       — Vite dev server (porta 5173, base /EarthRadar/)
build     — tsc + vite build
preview   — vite preview (porta 4173)
lint      — eslint .
format    — prettier --write .
test      — vitest run
test:watch — vitest
deploy    — git push origin main (CI/CD via Action)
```

## Struttura attesa

```
src/
  components/
    common/      Badge, Card, Empty, ErrorBoundary, Loading, PageHeader, Skeleton, ShareButton
    layout/      Header, Footer, BottomNav, DesktopNav, Layout, DisclaimerBanner, OnlineBadge
    maps/        Map2D (Leaflet+GIBS), Globe3D (react-globe.gl), LayerControl, MapLayerToggle, ViewModeToggle
    overlays/    EarthquakeLayer, SatelliteLayer, AircraftLayer, WeatherLayer, FireLayer, EventLayer, LightningLayer, GibsOverlay, TerminatorOverlay
    panels/      LayerPanel, EventDetail, EventList, LegendPanel
    charts/      OrbitMiniChart, MagnitudeBar
  pages/         Home, Layers, EventDetail, RadarMode (eredità), About, Education
  services/      usgsQuakesApi, celestrakApi, openSkyApi, openMeteoApi, firmsApi, eonetApi, gibsLayers, blitzortungLightningApi, issApi
  lib/           apiCache, sgp4Lite, groundTrack, deepLinkBuilder, riskCalculator, dayNightTerminator, formatters, sourceRegistry
  store/         layersStore, settingsStore, userLocationStore, eventsStore
  hooks/         useGeolocation, useNotifications, useOnlineStatus, useNasaApi, useLiveStream, useViewMode
  utils/         dates, units, geo (haversine, bearing), colors
  types/         events.ts, layers.ts, sources.ts
  i18n/          it.json, en.json, index.ts
public/          manifest.json, icons/, fallback-data/, CNAME, robots.txt
.github/         workflows/deploy.yml
```

## Linee guida operative

- **Autonomia**: scegli alternative tecniche di pari valore senza chiedere; documenta qui se la scelta è strutturale.
- **Errori**: 3 tentativi prima di fermarti.
- **API down**: usa fallback curati (`public/fallback-data/`) e procedi. Mostra badge "fallback" all'utente.
- **MVP first**: se una feature è troppo complessa, fai MVP e annota TODO nel CHANGELOG. Es: lightning live può partire come overlay statico GIBS GOES-GLM e diventare WebSocket Blitzortung in v1.1.
- **FIRMS senza MAP_KEY**: l'app deve funzionare ugualmente. Mostra messaggio + suggerimento link registrazione, e mostra GIBS Active Fires come default.
- **Disclaimer divulgativo** sempre presente.
- **Performance**: i layer si caricano on-demand (lazy import dei service). Il globo 3D si attiva solo se l'utente sceglie 3D.
- **Mobile**: il globo 3D deve essere usabile anche su iPhone medio. Se le perf sono scarse, suggerisci automaticamente 2D.

## Chiarificazioni post-review iniziale (2026-05-03)

Decisioni concordate con l'utente dopo la prima lettura. Vincolanti come le decisioni architetturali sopra.

1. **`gibsLayers` con flag `isRealTime`**: il porting da MeteorWatch usa `date - 1 day` per safety. Per layer real-time (GOES GeoColor, GOES-GLM, Active Fires) NON applicare lo shift: estendere `GibsLayer` con `isRealTime?: boolean` e usare `default` o timestamp recente.
2. **`three` deduplicato**: `react-globe.gl` ha `three` come peer. Pinnare `three` alla stessa major usata da `react-globe.gl` e configurare `resolve.dedupe: ['three']` in `vite.config.ts` per evitare l'errore "Multiple instances of Three.js".
3. **OpenSky degrade graceful**: poll 30s + cache + badge "fonte saturata" se 429 ripetuti. Niente fail hard.
4. **FIRMS è CSV**: parser CSV minimale nel service, non `res.json()`.
5. **RainViewer come overlay radar precipitazioni**: service distinto (`rainviewerApi.ts`) per il tile WMTS-like del radar. **Open-Meteo resta** per dati punto (current + forecast 8 celle direzionali). Entrambi nel pannello layer "Meteo".
6. **Texture Blue Marble adattiva**: 2K per mobile, 8K per desktop, via CDN NASA Visible Earth (`visibleearth.nasa.gov` / `eoimages.gsfc.nasa.gov`). Lazy load con switch su `matchMedia('(max-width: 768px)')`.
7. **Lightning v1.0**: solo GIBS GOES-GLM static. WS Blitzortung rimandato a v1.1 se emerge un mirror stabile e CORS-friendly. Non bloccare la release principale per questo.
8. **Radar Mode (eredità verde fosforo)**: Fase 5 strict optional. Decisione finale dopo che il resto è stabile. Se scartata, motivazione in CHANGELOG.

## Anti-pattern da evitare (errori del progetto vecchio)

- ❌ Mappare i satelliti con `INCLINATION` e `RA_OF_ASC_NODE` come lat/lon. Si usa **SGP4 reale** via satellite.js.
- ❌ Singolo file `app.js` con tutto dentro. Ogni service è un modulo separato.
- ❌ Niente cache: ogni fetch passa da `apiCache.ts`.
- ❌ Niente fallback: ogni service espone `getFallback()` che legge `public/fallback-data/<source>.json`.
- ❌ Niente i18n: tutte le stringhe utente in `i18n/{it,en}.json`.
- ❌ Niente disclaimer: ogni layer mostra fonte e timestamp ultimo update.
