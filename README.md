# EarthRadar — PezzaliAPP

> *La Terra dallo spazio in tempo reale. Tutto quello che si muove sopra e sotto la superficie, live.*
>
> *Earth from space, in real time. Everything moving above and below the surface, live.*

[![Deploy](https://github.com/pezzaliapp/EarthRadar/actions/workflows/deploy.yml/badge.svg)](https://github.com/pezzaliapp/EarthRadar/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-magenta)](https://www.alessandropezzali.it/EarthRadar/)
[![Tests](https://img.shields.io/badge/tests-285%2B-brightgreen)](https://github.com/pezzaliapp/EarthRadar/actions)

🌐 **Live**: https://www.alessandropezzali.it/EarthRadar/
☄️ **Sister apps**: [MeteorWatch](https://github.com/pezzaliapp/MeteorWatch) · [CubeSat Constellation](https://github.com/pezzaliapp/CubeSat_Constellation)

## Screenshots

> Generate locally with `npm run dev` + DevTools full-page capture (instructions in [`docs/screenshots/`](docs/screenshots/)).

| 2D map view (default mobile) | 3D globe view (default desktop) |
| --- | --- |
| ![Home 2D](docs/screenshots/home-2d.png) | ![Home 3D](docs/screenshots/home-3d.png) |

---

## English

EarthRadar is an open-source Progressive Web App (PWA) that aggregates **public USGS, NASA, NOAA, CelesTrak, OpenSky, Open-Meteo data** to give an at-a-glance view of what's happening on Earth right now — from space.

| Feature | Description |
|---|---|
| 🌐 **Dual view** | 2D map (Leaflet + NASA GIBS tiles) **and** 3D globe (Blue Marble + Black Marble night) — toggle anytime |
| 🌍 **Earthquakes** | USGS real-time GeoJSON, marker scaled by magnitude, severity traffic light |
| 🛰️ **Satellites** | True SGP4 propagation from CelesTrak TLE via `satellite.js`, 90-min ground track |
| ✈️ **Aircraft** | OpenSky live ADS-B states with heading vectors |
| 🌦️ **Weather** | Open-Meteo current + precipitation radar overlay |
| 🔥 **Wildfires** | NASA FIRMS active fires (with `MAP_KEY`) or GIBS Active Fires fallback |
| 🌪️ **Natural events** | NASA EONET — hurricanes, eruptions, icebergs, floods |
| ☁️ **GIBS overlays** | Real-time clouds (GOES), surface temperature, aerosol, snow, sea ice |
| ⚡ **Lightning** | Best-effort live (Blitzortung mirror) or static GIBS GOES-GLM |
| 🛰️ **ISS Live** | Real-time position + ground track + day/night terminator |
| 🌑 **Day/night terminator** | Solar position computed client-side |
| 📱 **PWA** | Offline cache, installable, mobile-first dark theme, glassmorphism |
| 🌍 **i18n** | Italian + English with browser auto-detection |
| 🔔 **Opt-in alerts** | Nearby M≥5 earthquakes, visible ISS passes |
| 🔗 **Sister-app deep links** | Click an asteroid → opens MeteorWatch · click a satellite → opens CubeSat |

### Quick start

```bash
git clone https://github.com/pezzaliapp/EarthRadar.git
cd EarthRadar
npm install
cp .env.example .env  # optional: VITE_NASA_API_KEY, VITE_FIRMS_MAP_KEY
npm run dev           # → http://localhost:5173/EarthRadar/
```

```bash
npm run build         # tsc + vite build
npm run preview       # vite preview --port 4173
npm run lint
npm run test
```

#### Local setup — FIRMS map key (optional)

NASA FIRMS Active Fires (NRT) requires a **personal map key**. Each developer
should generate **their own**, free of charge:

1. Open <https://firms.modaps.eosdis.nasa.gov/api/map_key/>
2. Submit your email — the key arrives instantly
3. Paste it in `.env` as `VITE_FIRMS_MAP_KEY=<your-key>`
4. **Never commit your key** — `.env` is git-ignored and keys are user-bound

> The production deploy on GitHub Pages does **not** ship a key (it's a static
> frontend; each consumer brings their own). Without a key, the app falls back
> automatically to **GIBS Active Fires** (daily, no-key) and shows a banner
> with a CTA to register a personal key.

### Architecture

- **React 18 + Vite + TypeScript** — strict mode, route-level code-splitting
- **TailwindCSS** dark-first, glassmorphism, custom palette (cyan #5cf0ff / magenta #ff5cd0)
- **Leaflet + react-leaflet** for the 2D map, **react-globe.gl + three.js** for the 3D globe
- **Zustand + persist** for state, versioned migrations on each schema bump
- **`satellite.js`** for SGP4/SDP4 propagation (no fake `INCLINATION`/`RA_OF_ASC_NODE` mapping)
- **vite-plugin-pwa (Workbox)**: 12+ origins with per-API caching strategies, manual `globIgnores` to keep the heavy 3D bundle out of the install precache
- **Vitest + Testing Library** — 285+ tests covering pure logic (formatters, deep links, SGP4 wrappers, pass predictor, ICS exporter, notifications) and component smoke (Home, Layout a11y)
- **NASA Blue Marble + Black Marble textures** hosted locally (`public/textures/`) to avoid CORS issues with the NASA CDN

### Deploy

A push to `main` triggers `.github/workflows/deploy.yml`:
1. `npm ci && npm run lint && npm run test && npm run build`
2. Upload `dist/` artifact
3. Deploy to GitHub Pages with CNAME `www.alessandropezzali.it`

### Sister apps

EarthRadar is part of the **PezzaliAPP** family of educational tools. The three apps cross-link via deep links:

| App | What it answers | Link in |
| --- | --- | --- |
| [**MeteorWatch**](https://github.com/pezzaliapp/MeteorWatch) | "What's coming from space?" — NEO, fireball, reentry tracker | `?event=<type>&id=<id>` |
| [**EarthRadar**](https://github.com/pezzaliapp/EarthRadar) | "What's happening on Earth right now?" — multi-source live map | `?lat=&lon=&view=&layers=` |
| [**CubeSat Constellation**](https://github.com/pezzaliapp/CubeSat_Constellation) | "What does that orbit look like in 3D?" — TLE-driven 3D viewer | `?tle=<base64>&name=<name>` |

Click a satellite in EarthRadar → opens its TLE in CubeSat. Click an asteroid event → opens MeteorWatch. Self-share copies the current map state. See [`src/lib/deepLinkBuilder.ts`](src/lib/deepLinkBuilder.ts).

### Credits

- USGS — Earthquake real-time GeoJSON
- NASA / JPL — GIBS, EPIC, EONET, FIRMS
- NOAA — GOES imagery via NASA GIBS
- CelesTrak — TLE data
- OpenSky Network — ADS-B aircraft states
- Open-Meteo — Free weather and precipitation API
- wheretheiss.at — ISS live position
- Blitzortung community — Lightning detection
- OpenStreetMap contributors

### License

MIT © 2026 Alessandro Pezzali

### Author

[PezzaliAPP](https://www.pezzaliapp.com) — Alessandro Pezzali

---

## Italiano

EarthRadar è una **PWA open-source** che aggrega dati pubblici **USGS, NASA, NOAA, CelesTrak, OpenSky, Open-Meteo** per dare a colpo d'occhio cosa sta succedendo sulla Terra adesso — vista dallo spazio.

| Feature | Descrizione |
|---|---|
| 🌐 **Doppia vista** | Mappa 2D (Leaflet + tile NASA GIBS) **e** globo 3D (Blue Marble + Black Marble notte) — toggle in qualsiasi momento |
| 🌍 **Terremoti** | USGS GeoJSON real-time, marker scalati per magnitudo, semaforo severità |
| 🛰️ **Satelliti** | Propagazione SGP4 vera da TLE CelesTrak via `satellite.js`, ground track 90 min |
| ✈️ **Aerei** | OpenSky stati ADS-B live con vettori di rotta |
| 🌦️ **Meteo** | Open-Meteo corrente + overlay radar precipitazioni |
| 🔥 **Incendi** | NASA FIRMS active fires (con `MAP_KEY`) o GIBS Active Fires come fallback |
| 🌪️ **Eventi naturali** | NASA EONET — uragani, eruzioni, iceberg, alluvioni |
| ☁️ **Overlay GIBS** | Nuvole real-time (GOES), temperatura superficie, aerosol, neve, ghiaccio |
| ⚡ **Fulmini** | Best-effort live (mirror Blitzortung) o GIBS GOES-GLM statico |
| 🛰️ **ISS Live** | Posizione real-time + ground track + terminatore giorno/notte |
| 🌑 **Terminatore** | Posizione solare calcolata client-side |
| 📱 **PWA** | Cache offline, installabile, tema dark mobile-first, glassmorphism |
| 🌍 **i18n** | Italiano + inglese con auto-detection |
| 🔔 **Alert opzionali** | Terremoti M≥5 nelle vicinanze, passaggi ISS visibili |
| 🔗 **Deep link sister app** | Click su un asteroide → apre MeteorWatch · click su un satellite → apre CubeSat |

### Avvio rapido

```bash
git clone https://github.com/pezzaliapp/EarthRadar.git
cd EarthRadar
npm install
cp .env.example .env  # opzionale: VITE_NASA_API_KEY, VITE_FIRMS_MAP_KEY
npm run dev           # → http://localhost:5173/EarthRadar/
```

#### Setup locale — map key FIRMS (opzionale)

NASA FIRMS Active Fires (NRT) richiede una **map key personale**. Ogni
sviluppatore ne genera **una propria**, gratuita:

1. Apri <https://firms.modaps.eosdis.nasa.gov/api/map_key/>
2. Inserisci la tua email — la key arriva subito
3. Incollala in `.env` come `VITE_FIRMS_MAP_KEY=<la-tua-key>`
4. **Non committare mai la tua key** — `.env` è git-ignored e ogni key è
   nominale

> Il deploy in produzione su GitHub Pages **non** include una key (è un
> frontend statico, ognuno usa la sua). Senza key, l'app fa fallback
> automatico a **GIBS Active Fires** (giornaliero, no key) e mostra un
> banner con la CTA per registrarne una.

### Avviso

> Strumento divulgativo basato su dati pubblici NASA / JPL / USGS / NOAA / CelesTrak / OpenSky / Open-Meteo / OpenStreetMap.
> **Non sostituisce sistemi ufficiali di protezione civile, navigazione aerea, sismologia, meteorologia operativa o difesa planetaria.**
> Le posizioni dei satelliti sono propagate da TLE pubblici e hanno incertezza tipica di km su orbite basse. I dati di traffico aereo dipendono dalla copertura dei ricevitori ADS-B.

### Licenza

MIT © 2026 Alessandro Pezzali

### Autore

[PezzaliAPP](https://www.pezzaliapp.com) — Alessandro Pezzali
