# EarthRadar — Analisi iniziale

## Scopo

PWA divulgativa che risponde alla domanda:
> *"Cosa sta succedendo sulla Terra adesso?"*

Tagline: **La Terra dallo spazio in tempo reale.**
Sottotitolo: *Tutto quello che si muove sopra e sotto la superficie, live.*

Target: appassionati di scienze della Terra, divulgatori, studenti, curiosi, osservatori del cielo.

**Strumento divulgativo, NON sostituisce sistemi ufficiali di protezione civile, navigazione aerea, sismologia, meteorologia operativa o difesa planetaria.**

## Posizionamento nella famiglia PezzaliAPP

EarthRadar è la **terza app** della trilogia "Earth & Space" di PezzaliAPP:

| App | Risponde a | Vista | Sister link |
|---|---|---|---|
| **EarthRadar** *(questa)* | Cosa succede sulla Terra adesso? | Globo + mappa con layer live | → MeteorWatch, → CubeSat |
| **MeteorWatch** | Cosa cade dal cielo? | Mappa Leaflet + APOD/EPIC | → CubeSat, → EarthRadar |
| **CubeSat Constellation** | Come orbitano i satelliti? | Globo 3D Three.js | → EarthRadar |

Le tre app condividono stile (dark-space, ciano/magenta, glassmorphism), pattern (cache, fallback, i18n, disclaimer) e si collegano via **deep link bidirezionali**.

## Da dove veniamo: il vecchio `radarApp`

Il progetto precedente (`radarApp-main`) era una PWA vanilla JS da ~40 KB con un singolo file `app.js`, che proiettava 4 fonti (USGS, CelesTrak, OpenSky, Open-Meteo) su un canvas 2D circolare con sweep verde fosforo. Limiti noti:

- Satelliti **finti**: lat/lon ricavati grossolanamente da `INCLINATION` e `RA_OF_ASC_NODE` invece di propagazione SGP4.
- Niente cache, niente fallback offline, niente test, niente i18n.
- Visualizzazione "radar polare" affascinante ma non scientifica.
- Nessuna texture Terra né overlay satellitari NASA.

EarthRadar **mantiene lo spirito** ("vedere live cosa succede da una postazione") ma alza il livello a quello di MeteorWatch: stack moderno, dati reali correttamente propagati, mappa NASA-grade, vista 3D opzionale, PWA installabile.

## Architettura

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser PWA (offline-capable)                 │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   Pages (UI) → React Router v6, basename /EarthRadar     │   │
│   └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┴────────────────┐                  │
│              ▼                                 ▼                  │
│   ┌──────────────────────┐         ┌─────────────────────────┐   │
│   │   Map2D (Leaflet     │         │   Globe3D (react-       │   │
│   │   + NASA GIBS tiles) │         │   globe.gl, three.js)   │   │
│   └──────────────────────┘         └─────────────────────────┘   │
│              │                                 │                  │
│              └───────────────┬─────────────────┘                  │
│                              ▼                                   │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │   Services (uno per fonte) → cachedFetch → idb-keyval    │   │
│   └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│   ┌──────────────────────────┼──────────────────────────────┐    │
│   │  Service Worker (Workbox) → tile cache, runtime cache   │    │
│   └──────────────────────────┼──────────────────────────────┘    │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  USGS · CelesTrak · OpenSky · Open-Meteo · NASA FIRMS · NASA    │
│  EONET · NASA GIBS · NASA EPIC · wheretheiss.at · Blitzortung   │
└─────────────────────────────────────────────────────────────────┘
```

Tutti i calcoli orbitali (propagazione SGP4, ground track) sono **client-side** via `satellite.js`. Nessun backend.

## Stack scelto e motivazioni

| Tecnologia | Motivazione |
|---|---|
| **React 18 + Vite + TypeScript** | DX rapida, type safety, build veloci, coerenza con MeteorWatch |
| **TailwindCSS dark-mode-first** | Design system condiviso PezzaliAPP, prototipazione rapida |
| **Leaflet + react-leaflet** | Mappa 2D leggera (~40 KB gzipped), supporta NASA GIBS WMTS, no token |
| **react-globe.gl** | Globo 3D dichiarativo basato su three.js. ~150 KB. Supporta texture NASA Blue Marble, markers, archi orbitali, paths. Più leggero di Cesium e adatto a PWA mobile. **Decisione: default. Cesium/Resium da valutare solo se servisse precisione orbitale a livello di occlusione/ombre realistiche.** |
| **Zustand + persist** | State minimale, persist localStorage. Stessa libreria di MeteorWatch |
| **vite-plugin-pwa (Workbox)** | Manifest, SW autoUpdate, runtime caching declarativo |
| **idb-keyval** | Cache IndexedDB key/value (più semplice di Dexie) |
| **satellite.js** | SGP4/SDP4 client-side, ground track, ECI→geodetic |
| **date-fns** | Timezone-aware, multi-locale (it/en) |
| **react-router-dom v6** | Routing standard con `basename="/EarthRadar"` |

## Fonti dati e politica di cache

| Fonte | Endpoint | Auth | TTL | Live? | Fallback |
|---|---|---|---|---|---|
| **USGS Earthquakes** | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` | nessuna | 5 min | poll | JSON locale |
| **CelesTrak GP** | `celestrak.org/NORAD/elements/gp.php?GROUP=...&FORMAT=json` | nessuna | 6 h | propagato client-side | TLE statici (ISS, stations, starlink) |
| **OpenSky States** | `opensky-network.org/api/states/all` | opzionale (rate limit più alto) | 30 s | poll 30 s | array vuoto + badge |
| **Open-Meteo current** | `api.open-meteo.com/v1/forecast` | nessuna | 15 min | poll | array vuoto |
| **Open-Meteo radar** | `api.open-meteo.com/v1/forecast?...precipitation` (tile o vector) | nessuna | 15 min | poll | array vuoto |
| **NASA FIRMS** | `firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/<source>/<area>/<days>` | `VITE_FIRMS_MAP_KEY` (gratis ma serve registrazione) | 30 min | poll | **GIBS Active Fires** (no key) |
| **NASA EONET** | `eonet.gsfc.nasa.gov/api/v3/events?status=open` | nessuna | 1 h | poll | JSON locale |
| **NASA GIBS WMTS** | `gibs.earthdata.nasa.gov/wmts/epsg3857/best/<LAYER>/default/<DATE>/<MATRIX>/{z}/{y}/{x}.{ext}` | nessuna | 24 h tile | n/a | OSM standard |
| **NASA EPIC** | `epic.gsfc.nasa.gov/api/natural` | DEMO_KEY | 2 h | n/a | array vuoto |
| **wheretheiss.at ISS** | `api.wheretheiss.at/v1/satellites/25544` | nessuna | 10 s | poll | last cached |
| **Blitzortung lightning** | mirror community (best-effort) | nessuna | live WS | live | GIBS GOES-GLM static |

## Layer GIBS attivabili (selezione iniziale)

| ID | Layer GIBS | Uso |
|---|---|---|
| `gibs_modis_truecolor` | `MODIS_Terra_CorrectedReflectance_TrueColor` | Base "vero colore" diurno |
| `gibs_viirs_truecolor` | `VIIRS_SNPP_CorrectedReflectance_TrueColor` | Base alternativa più recente |
| `gibs_blackmarble` | `VIIRS_Black_Marble` | Base notturna luci 2016 |
| `gibs_clouds_geocolor` | `GOES-East_ABI_GeoColor` (real-time) | Nuvole tempo quasi reale |
| `gibs_temperature` | `AIRS_L2_Surface_Air_Temperature_Day` | Overlay temperatura superficie |
| `gibs_aerosol` | `MODIS_Combined_Value-Added_AOD` | Aerosol Optical Depth |
| `gibs_fires` | `MODIS_Fires_All` | Incendi (fallback senza FIRMS key) |
| `gibs_snow` | `MODIS_Terra_Snow_Cover` | Copertura nevosa |
| `gibs_seaice` | `AMSR2_Sea_Ice_Concentration_12km` | Ghiaccio marino |

L'utente sceglie quali attivare da un pannello "GIBS Overlays" (toggle multiplo, opacity slider per ciascuno).

## Decisioni architetturali

1. **Base path**: `/EarthRadar/` per Vite, manifest, router, SW. Deploy `https://www.alessandropezzali.it/EarthRadar/`.
2. **PWA scope**: `/EarthRadar/` con `start_url` corrispondente.
3. **Service Worker** (vite-plugin-pwa):
   - StaleWhileRevalidate per API NASA/USGS/CelesTrak (TTL diversi)
   - NetworkFirst per OpenSky e ISS live (timeout 4s)
   - CacheFirst per fallback data e tile GIBS (cache lunga)
   - navigateFallback per SPA routing offline
4. **Cache layer applicativo**: ogni servizio passa da `lib/apiCache.ts` (idb-keyval) con TTL e fallback offline. Doppia protezione (SW + idb-keyval).
5. **API key NASA**: `VITE_NASA_API_KEY` con fallback `DEMO_KEY`. **FIRMS** richiede `VITE_FIRMS_MAP_KEY`; se assente, switch automatico a GIBS Active Fires.
6. **Calcoli orbitali**: `satellite.js` lato client. Ground track 90 min. Lo "spaghetto" mostrato sul globo è la traccia futura propagata.
7. **Vista 2D vs 3D**: toggle in header globale, persistito in `settingsStore`. Mobile default = 2D, desktop default = 3D. Sempre commutabile.
8. **Deep link sister app**:
   - **EarthRadar → MeteorWatch**: `?event=<type>&id=<id>` (type: `neo|fireball|reentry|iss`)
   - **EarthRadar → CubeSat**: `?tle=<base64TLE>&name=<name>` (riusa schema esistente)
   - **MeteorWatch → EarthRadar**: `?lat=<x>&lon=<y>&layer=<id>&date=<iso>`
   - **CubeSat → EarthRadar**: `?norad=<id>&layer=satellites`
9. **i18n**: file JSON in `src/i18n/{it,en}.json`, lingua di default = browser, fallback IT, sync `<html lang>`.
10. **Geolocalizzazione**: opt-in via `useGeolocation`. Fallback Reggio Emilia (lat 44.698, lon 10.631) — omaggio al progetto originale.
11. **Disclaimer**: banner persistente + modale al primo accesso. Fonte dati visibile in ogni layer.
12. **Notifiche**: opt-in. Trigger minimi v1: terremoti M≥5 entro 1000 km, ISS pass visibile. Anti-spam log localStorage cooldown 30 min.
13. **Testing**: Vitest per logica pura (formatters, deep link, propagazione SGP4 wrapper, riskCalculator).
14. **Lint + Build prima di ogni commit** è policy CLAUDE.md.

## Scelte di design

- Sfondo dark-space (radial gradient nero/blu notte), simile a MeteorWatch
- Accenti **ciano (#5cf0ff)** e **magenta (#ff5cd0)** per coerenza famiglia PezzaliAPP
- **Semaforo verde / giallo / rosso** per severità eventi (terremoto magnitudo, fire confidence, EONET category)
- Font monospace per dati tecnici (JetBrains Mono fallback)
- Glassmorphism leggero su card e header (`backdrop-blur-md`)
- Mobile-first, BottomNav su < md, fix iOS (`--vh` hack, `apple-mobile-web-app-capable`)
- Footer con link a MeteorWatch, CubeSat Constellation, pezzaliapp.com, GitHub
- Animazioni discrete (twinkle stars dietro il globo, pulse-slow su eventi rossi)
- **Modalità "Radar Mode" eredità**: tab opzionale che ricicla l'estetica vintage del canvas verde fosforo del progetto originale come tributo. Decisione finale a Claude Code: tenere come easter egg o scartare se costa troppo.

## Roadmap

### v1.0 — initial public release
- Vista 2D Leaflet con layer base GIBS commutabili
- Vista 3D `react-globe.gl` con texture Blue Marble + Black Marble notte
- Layer USGS terremoti con marker scalati per magnitudo + listing laterale
- Layer satellites con SGP4 reale e ground track 90 min
- Layer aircraft OpenSky con vettori velocità
- Layer weather Open-Meteo (corrente + radar)
- Layer fires (FIRMS se key presente, altrimenti GIBS)
- Layer EONET eventi naturali con icone categorie
- Layer ISS con ground track
- Terminatore giorno/notte
- Toggle 2D/3D, pannello layer, legend, share
- i18n IT/EN, PWA installabile, fallback offline
- Footer cross-link sister app, deep link bidirezionali
- Disclaimer + sources

### v1.1 — incrementale
- Lightning live via WebSocket Blitzortung mirror
- Heatmap densità terremoti / aerei
- Filtri avanzati (range magnitudo, alt aerei, paese)
- Storia eventi (timeline 7 giorni)
- Export `.csv` rilevamenti correnti
- Modalità "Radar Polare" easter egg (se non già in v1.0)

### v1.2+
- AR mode (DeviceOrientationEvent) per puntare il telefono al cielo e vedere ISS/satelliti
- Periodic Background Sync per notifiche dove supportato
- Test e2e Playwright
- Rumor mode: TG news geocoded? (post-MVP, da valutare)
- Replay temporale (slider data per GIBS)

### v2.x — visione
- Dataset offline più ampio (snapshot mensile pre-bundled)
- Climate-aware: trend annuali (terremoti / fires / eventi)
- Modulo "report cittadino" — segnalazione utente con foto + geolocalizzazione (richiederebbe backend → da valutare con cura)

## File chiave attesi

```
vite.config.ts                   → base path /EarthRadar/, vite-plugin-pwa
src/lib/apiCache.ts              → cachedFetch con TTL + stale fallback (porting da MeteorWatch)
src/lib/sgp4Lite.ts              → wrapper SGP4 con ground track (porting da MeteorWatch)
src/lib/deepLinkBuilder.ts       → ponte verso MeteorWatch e CubeSat
src/lib/dayNightTerminator.ts    → calcolo terminatore (porting da MeteorWatch)
src/lib/sourceRegistry.ts        → registry di tutte le fonti con licenza/attribution
src/services/*                   → uno per fonte dati
src/components/maps/Map2D.tsx    → mappa Leaflet + GIBS
src/components/maps/Globe3D.tsx  → globo react-globe.gl
src/store/layersStore.ts         → quali layer sono attivi e in che opacity
src/store/settingsStore.ts       → preferenze utente (vista, lingua, notifiche)
.github/workflows/deploy.yml     → CI/CD su gh-pages con CNAME
```

## Avviso

> Strumento divulgativo basato su dati pubblici NASA / JPL / USGS / NOAA / CelesTrak / OpenSky / Open-Meteo / OpenStreetMap.
> **Non sostituisce sistemi ufficiali di protezione civile, navigazione aerea, sismologia, meteorologia operativa o difesa planetaria.**
> Le posizioni dei satelliti sono propagate da TLE pubblici e possono avere incertezza tipica di km su orbite basse. I dati di traffico aereo sono best-effort dipendenti da copertura ricevitori ADS-B.
