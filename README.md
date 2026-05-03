# EarthRadar — PezzaliAPP

> *La Terra dallo spazio in tempo reale. Tutto quello che si muove sopra e sotto la superficie, live.*
>
> *Earth from space, in real time. Everything moving above and below the surface, live.*

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-magenta)](https://www.alessandropezzali.it/EarthRadar/)

🌐 **Live**: https://www.alessandropezzali.it/EarthRadar/
☄️ **Sister apps**: [MeteorWatch](https://github.com/pezzaliapp/MeteorWatch) · [CubeSat Constellation](https://github.com/pezzaliapp/CubeSat_Constellation)

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

### Deploy

A push to `main` triggers `.github/workflows/deploy.yml`:
1. `npm ci && npm run lint && npm run test && npm run build`
2. Upload `dist/` artifact
3. Deploy to GitHub Pages with CNAME `www.alessandropezzali.it`

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

### Avviso

> Strumento divulgativo basato su dati pubblici NASA / JPL / USGS / NOAA / CelesTrak / OpenSky / Open-Meteo / OpenStreetMap.
> **Non sostituisce sistemi ufficiali di protezione civile, navigazione aerea, sismologia, meteorologia operativa o difesa planetaria.**
> Le posizioni dei satelliti sono propagate da TLE pubblici e hanno incertezza tipica di km su orbite basse. I dati di traffico aereo dipendono dalla copertura dei ricevitori ADS-B.

### Licenza

MIT © 2026 Alessandro Pezzali

### Autore

[PezzaliAPP](https://www.pezzaliapp.com) — Alessandro Pezzali
