# CAM-AUDIT-R1 — Layer webcam/CCTV per EarthRadar

**Data:** 2026-09-28

**Stato repository:** `main` @ `a58e77c` (v1.2.4), working tree pulito all'avvio

**Natura del documento:** solo analisi. Nessun file applicativo modificato, nessuna dipendenza installata, nessun commit o push.

**Verdetto:** **GO CON LIMITI** (vedi §7)

---

## 0. Sintesi

- Si può realizzare un layer **📷 CAM** a **costo €0** senza backend, senza Worker, senza API key e senza proxy.
- Si usano **cataloghi ufficiali open data** (autorità stradali/pubbliche) **normalizzati una volta in un catalogo statico versionato**, servito da GitHub Pages dallo stesso origin dell'app.
- Le **immagini** si caricano **direttamente dalla sorgente ufficiale**, **solo per la camera selezionata** e solo mentre la scheda è aperta.
- OSIRIS è utile come riferimento sulle fonti, **non come architettura**. Il suo CCTV richiede un server Node sempre acceso, un proxy di immagini con Referer falsificato, header `X-Forwarded-For` falsificati, una Basic Authorization estratta da un widget di terzi e l'uso di API interne non documentate. Nessuna di queste cose è compatibile con i vincoli di EarthRadar.
- **CAM v1 consigliato (fase 1):** TfL JamCams (Londra), Fintraffic Digitraffic (Finlandia), Hong Kong Transport Department.
  - Circa **2.600 camere**, tutte **SNAP**, tutte CORS-open e keyless, con licenze esplicite (OGL / CC BY 4.0 / DATA.GOV.HK).
  - **Zero nuove dipendenze.**
- **Fase 1b (stesso v1 o v1.1):** Caltrans, con circa 3.400 camere SNAP e circa 2.300 stream HLS **LIVE** veri.

---

## 1. PRIMA PARTE — Audit EarthRadar (dal codice)

### 1.1 Architettura reale
SPA React 18 + Vite 5 + TypeScript, PWA con `vite-plugin-pwa`. Base path `/EarthRadar/`, deploy statico su GitHub Pages (`.github/workflows/deploy.yml`: lint, test, build, upload `dist`). CNAME `www.alessandropezzali.it`.

L'unica componente server è `workers/aircraft-gateway/`: un Cloudflare Worker su piano Free, dedicato **solo** al traffico aereo (FlyItalyADSB con secret lato Worker). CAM **non deve** appoggiarsi a questo gateway (§4).

### 1.2 Stack e dipendenze (`package.json`)
- **Runtime:** react 18, react-router-dom 6, leaflet 1.9 + react-leaflet 4, react-globe.gl 2.37 + three 0.184, satellite.js 5, zustand 4, idb-keyval 6, date-fns 3.
- **Dev:** vitest 2 + jsdom + Testing Library, eslint 9, prettier, tailwind 3.
- **Assenti:** librerie di clustering, hls.js, video player. **Nessuna CSP** in `index.html`.

### 1.3 Stato
Zustand con `persist`:
- **`src/store/layersStore.ts`** (`earthradar:layers`, version 7)
  - `LayerId` è una union chiusa.
  - `overlays: Record<LayerId, {enabled, opacity}>` è **persistito**.
  - `merge` fa `{...current.overlays, ...persisted.overlays}`, quindi un nuovo layer prende il default del codice finché l'utente non lo tocca.
  - Selezioni transitorie (`selectedFireId`, `selectedAircraft`, …) non persistite.
- **`src/store/settingsStore.ts`**
  - `viewMode` di default: `2d` su mobile (≤768px), `3d` su desktop.
  - `perfFallbackTriggered`.
- **`src/store/aircraftStore.ts`**: store dedicato agli aerei.

### 1.4 Mappa 2D (`src/components/maps/Map2D.tsx`)
- Struttura:
  - `MapContainer` Leaflet con `worldCopyJump`.
  - Base `SatelliteTileLayer`, poi `GibsOverlayHost`, poi `TerminatorOverlay`.
  - I layer dati arrivano come `children`.
- `MapRefBridge` aggiorna `mapCenter` nello store a `moveend`/`zoomend`.
- Non c'è `preferCanvas`. I marker sono componenti react-leaflet uno per elemento:
  - `CircleMarker`: quakes, FIRMS;
  - `Marker` + `divIcon`: EONET.

### 1.5 Globo 3D (`src/components/maps/Globe3D.tsx`)
- Chunk lazy da circa 1,86 MB minificati (`dist/assets/Globe3D-*.js`), escluso dal precache.
- **Riusa gli stessi hook della 2D**, senza doppio network.
- Unisce quakes, EONET e FIRMS in un solo `pointsData` di tipo `PointEntity` con `kind`, e gestisce il click in `onPointClick`.
- Aggiorna `mapCenter` a camera ferma (debounce di 1 s su `onZoom`).
- Ha già un cap: FIRMS è limitato a 500 punti (`fires.hotspots.slice(0, 500)`).
- `usePerfFallback`: se in 3 s la media è sotto 25 fps, passa automaticamente in 2D.

### 1.6 Sistema layer
Pattern uniforme e ripetuto in `src/pages/Home.tsx`:
- flag `overlays.<id>.enabled` letto dallo store;
- `lazy(() => import('@/components/overlays/<X>Layer'))` montato **solo se enabled**;
- pannello dettaglio lazy separato;
- riga dedicata in `src/components/panels/LayerPanel.tsx` (`FiresRow`, `EonetRow`, …).

I layer non supportati in 3D generano il banner `home.overlayOnly2D`.

### 1.7 Caricamento dataset
- Ogni sorgente ha un service in `src/services/*Api.ts` e un hook in `src/hooks/use*.ts`.
- Fetch tramite `src/lib/apiCache.ts`:
  - `cachedFetch` / `cachedFetchTraced` su idb-keyval, con TTL;
  - in caso di errore restituisce il dato stale, poi il fallback;
  - `source: fresh|stale|fallback` alimenta `SourceBadge`.
- File di fallback in `public/fallback-data/`.
- FIRMS carica per viewport (bbox da `map.getBounds()` su `moveend`).

### 1.8 Clustering
**Non esiste.** Nessuna libreria. La densità è gestita con cap (FIRMS 500 per viewport).

### 1.9 Cache / PWA / Service Worker (`vite.config.ts`)
- `registerType: 'autoUpdate'`.
- ⚠️ **`globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}']`**: **ogni `.json` in `public/` viene precachato all'installazione.**
  - Un catalogo CAM messo in `public/` verrebbe scaricato da **tutti** gli utenti anche con CAM OFF.
  - Serve `globIgnores` esplicito (§4, punto 3). È il principale rischio di regressione "CAM OFF ≠ traffico zero".
- `runtimeCaching` per host:
  - SWR per USGS, NASA e CelesTrak;
  - `NetworkOnly` per il gateway aerei;
  - `CacheFirst` per GIBS e Visible Earth.
- `navigateFallback` SPA.

### 1.10 Popup / marker
- In 2D si usa soprattutto `Tooltip` (hover) + `click → setSelectedXxx` + **pannello dettaglio nella colonna laterale**. Solo `EarthquakeLayer` usa `Popup` Leaflet.
- ⚠️ **Su mobile** (sotto `lg`) i pannelli dettaglio stanno dentro `#layer-panel-mobile`, che è `hidden` finché l'utente non preme "Layer" (`Home.tsx`, `showPanelMobile`). Un click su un marker su iPhone non mostra nulla di visibile.
  - Per CAM questo è inaccettabile: la preview deve comparire dove l'utente ha toccato.
  - Soluzione: **`Popup` Leaflet in 2D** e **card flottante sopra il globo in 3D**, entrambi con lo stesso componente `CamCard`.

### 1.11 Proxy / gateway
Solo `aircraft-gateway`: allowlist di origin, cache Cache API, secret. Non generico e non va esteso a CAM.

### 1.12 Mobile
- Default 2D; mappa a `62vh`.
- Il pannello layer è un blocco a scomparsa sotto la mappa.
- Fallback automatico 2D per fps bassi.
- Globo con texture adattive (`textureLoader`).

### 1.13 Inserimento di CAM senza regressioni
1. Aggiungere `'cam'` a `LayerId` con `DEFAULT_OVERLAYS.cam = ov(false, 1)`. Il merge dello store lo introduce OFF per tutti gli utenti esistenti.
2. **Non persistere** l'attivazione di CAM.
   - Opzione consigliata: in `partialize` si salva `overlays` con `cam.enabled = false`.
   - Così a ogni avvio CAM è OFF e nessuna richiesta CAM parte senza un gesto esplicito.
3. Layer e card montati via `lazy()` solo se enabled, come gli altri layer. Il chunk CAM non entra in `index` né in `Home`.
4. Catalogo escluso dal precache e caricato solo al primo ON.
5. Non toccare `SHAREABLE_LAYER_IDS` in v1: un deep link non deve accendere CAM di nascosto. Si valuta in v1.1.

---

## 2. SECONDA PARTE — Audit OSIRIS CCTV

`simplifaisoul/osiris`, HEAD `7a3daec`, analizzato da clone superficiale. Nessun segreto è stato copiato in questo documento.

### 2.1 File e route (Next.js 16, runtime Node)
- **Route principale:** `src/app/api/cctv/route.ts` (~1.000 righe), `GET /api/cctv?region=…|lat=&lng=&radius=`.
  - `radius` viene letto ma **non usato**: il filtro è per bbox di regione codificati a mano.
- **Altre route:**
  - `api/cctv/proxy/route.ts`: proxy immagini;
  - `api/cctv/resolve/route.ts`: scraping di pagine Skyline e YouTube `/live` per ricavare l'id embed;
  - `api/cctv/stream-status/route.ts`;
  - `api/cctv/texas/snapshot/route.ts`: decodifica JPEG base64 TxDOT.
- Circa 45 moduli sorgente (`ibi511.ts`, `opencctv.ts`, `netherlands.ts`, `asfinag.ts`, …) e tipo comune `types.ts`.
- **Librerie:**
  - `sourceCache.ts`: TTL in memoria di 30 min + stale;
  - `cctv-snapshot.ts`: catalogo su disco `.cache/cctv-catalog.json`, gzip + ETag;
  - `ssrf-guard.ts`: `safeFetch`;
  - `stealthFetch.ts`.
- **Frontend:**
  - `page.tsx` carica **tutto** il catalogo all'accensione del layer;
  - `OsirisMap.tsx` usa MapLibre con layer circle GeoJSON;
  - `CctvPreviews.tsx`: fino a 8 tile live sulla mappa;
  - `CameraViewer.tsx`: hls.js, iframe o img.

### 2.2 Formato dati
`{id, lat, lng, name, city, country, feed_url?, stream_url?, stream_type?: 'jpg'|'hls'|'iframe'|'mjpeg'|'mp4', external_url?, source}`.

Coordinate WGS84, parsate per sorgente (WKT, GeoJSON, stringhe). Le liste statiche sono geocodificate con Nominatim.

### 2.3 Cataloghi
- **Runtime lato server:** ~48 regioni da endpoint ufficiali. I numeri dichiarati sono 17k+ (README) e 35k (commento nel codice).
- **Liste statiche in TS generate da script `scratch/`:**
  - scraping di bekijkhet.nu e skylinewebcams.com;
  - ~300 "public webcams", ~600 Skyline, liste manuali per PL/ES/JP/FR/IT (16 camere Skyline).

### 2.4 Clustering / viewport
- **Nessun clustering** (GeoJSON source senza `cluster:true`).
- **Nessun caricamento per viewport lato client**: `region=all` con retry.

### 2.5 Preview / refresh
- Tile JPEG sulla mappa ogni 15 s, viewer JPEG ogni 5 s.
- HLS via hls.js; iframe per YouTube e ipcamlive.

### 2.6 Proxy e sicurezza
Il proxy immagini ha un'allowlist di host (CDN Skyline, S3, inmoves, dgt, …), ma:
1. segue i redirect **senza ricontrollare l'allowlist**;
2. **non** usa `safeFetch` (nessun blocco di IP privati);
3. usa `rejectUnauthorized=false`;
4. l'entry S3 accetta qualsiasi bucket e fa pass-through del Content-Type (issue #349, stored XSS, **aperta**).

Inoltre:
- **Referer falsificato** per aggirare l'hotlink protection (Rijkswaterstaat, Skyline).
- `stealthFetch` inietta **`X-Forwarded-For`/`X-Real-IP` falsificati da range ISP residenziali** + UA a rotazione. La PR #248 che lo rimuoveva ("violates the terms of several upstream feeds") è stata chiusa senza merge.

### 2.7 Credenziali
- `asfinag.ts`: **Basic Authorization hardcoded** (estratta dal widget mappa di asfinag.at), inviata con Origin e Referer falsificati.
- Issue #157: secret IpcamLive storico in `greece.ts`, oggi rimosso dal file ma presente nel testo dell'issue.
- Nessun'altra key trovata nel codice CCTV.

### 2.8 Sorgenti non realmente "gratuite" o non riutilizzabili
- **OpenCCTV:** aggregatore con API interna non documentata.
- **SkylineWebcams:** commerciale, CDN con hotlink protection aggirata.
- **Stream privati:** broadcaster privati (PL tkchopin), YouTube hardcoded, ipcamlive, rtsp.me.
- **ASFINAG:** credenziali di terzi.
- **Rijkswaterstaat:** hotlink aggirato.

Nessuna richiede pagamento, ma **l'uso che ne fa OSIRIS è incompatibile con i termini** delle sorgenti (questo è un giudizio, non verificato clausola per clausola).

### 2.9 Deploy
Il README dice Vercel, ma il repository usa Docker + nginx + `deploy.sh` via SSH su un server. **Il CCTV richiede un server Node sempre acceso**: cache in memoria, snapshot su disco, proxy, `maxDuration` di 60 s.

### 2.10 Issue rilevanti
- #298: base GDPR per le webcam UK, chiusa senza risposta nel merito.
- #349: XSS via proxy S3.
- #156: SSRF, risolta.
- #169: Windy X-Frame-Options.
- #251: copertura sbilanciata.
- #138 / #133: conteggi gonfiati.

Licenza del codice: MIT. **Non copre i contenuti delle camere.**

### 2.11 Cosa riprendere e cosa no
| Riprendere | NON riprendere |
|---|---|
| Elenco di fonti ufficiali open data | Server Node / proxy immagini / proxy HLS |
| Tipo `stream_type` distinto (→ LIVE/SNAP/LINK) | Referer, XFF e UA falsificati |
| Refresh JPEG solo per le camere visibili/aperte, con cache-buster | Credenziali estratte da widget di terzi |
| Cap sul numero di preview simultanee | Scraping di siti commerciali, iframe YouTube hardcoded |
| | Caricamento integrale di 17k–35k punti senza clustering |

---

## 3. TERZA PARTE — Fonti CAM verificate

Verifica tecnica del 2026-09-28 con `curl`, header `Origin: https://www.alessandropezzali.it`, più lettura delle pagine di licenza. TfL, Digitraffic e l'immagine HK sono state **ricontrollate in modo indipendente**: 890/812 TfL, 809 stazioni FI, ACAO `*` confermato.

"CORS" si riferisce al **catalogo**. Le immagini in `<img>` non richiedono CORS; lo richiederebbero solo `fetch`/canvas, che non si usano.

| SOURCE | PAESE/AREA | N. CAM (verificato) | TIPO | API KEY | COSTO | CORS catalogo | PROXY? | TERMINI/RIUTILIZZO | AFFIDABILITÀ | EARTHRADAR |
|---|---|---|---|---|---|---|---|---|---|---|
| **TfL JamCams** — `api.tfl.gov.uk/Place/Type/JamCam` | UK · Londra | 890 (812 `available`) | SNAP (JPEG ~5 min) + clip MP4 registrata (→ SNAP, non LIVE) | No (app_key facoltativa, non usata) | €0 | `*` | No | OGL v2 + emendamenti TfL; attribuzione "Powered by TfL Open Data"; limite 500 req/min | Alta | **SÌ (v1)** |
| **Fintraffic Digitraffic** — `tie.digitraffic.fi/api/weathercam/v1/stations` | Finlandia | 809 stazioni / 2.275 preset | SNAP (~10 min) | No (header `Digitraffic-User` consigliato) | €0 | `*` (richiede gzip; il browser lo manda) | No | **CC BY 4.0**, "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY" | Alta | **SÌ (v1)** |
| **Hong Kong TD** — `static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml` | Hong Kong | 1.013 | SNAP (~2 min) | No | €0 | `*` | No | DATA.GOV.HK: uso libero anche commerciale, attribuzione | Alta | **SÌ (v1)** |
| **Caltrans CCTV** — `cwwp2.dot.ca.gov/data/dNN/cctv/cctvStatusDNN.json` | USA · California | 3.591 (3.408 in servizio; 2.305 con HLS) | **LIVE** (HLS `wzmedia.dot.ca.gov`, ACAO `*`) + SNAP | No | €0 | `*` | No | Pubblico dominio "unless otherwise indicated"; "no charge"; nessuna clausola anti-hotlink | Alta | **SÌ (v1b)**: catalogo ~15 MB → solo build-time |
| **NZTA Waka Kotahi** — `trafficnz.info/service/traffic/rest/4/cameras/all` | Nuova Zelanda | 313 (253 online) | SNAP | No | €0 | **assente** | No (catalogo build-time) | CC BY 4.0 | Media-alta | SÌ (v1.1, build-time) |
| **DriveBC** — `drivebc.ca/api/webcams/` | Canada · BC | 1.066 (1.046 attive) | SNAP | No | €0 | **assente** (immagini `*`) | No (catalogo build-time) | Open Government Licence – BC | Media (endpoint documentato storico in timeout) | SÌ (v1.1, build-time) |
| **Singapore LTA** — `api.data.gov.sg/v1/transport/traffic-images` | Singapore | **8** oggi (storicamente ~90) | SNAP (~1 min) | No | €0 | `*` | No | Singapore Open Data Licence | **Bassa** (conteggio anomalo, v2 non confermata) | NO per ora |
| **USGS HVO volcano cams** | USA · Hawaii | lista manuale (decine) | SNAP | No | €0 | n/a (nessun catalogo) | No | Pubblico dominio USGS | Media | Opzionale v1.1 (lista curata a mano) |
| **WSDOT** | USA · WA | 1.705 | SNAP | API ufficiale: AccessCode (gratuito, via email) | €0 ma **key** | ArcGIS: eco dell'origin | No | non letti | — | NO (key; ArcGIS senza geometria) |
| **511NY** | USA · NY | 2.933 (1.765 video) | LIVE (HLS) | **Richiesta** da documentazione (risponde anche senza: non affidabile) | — | assente | — | Key developer | — | **NO** |
| **NYC DOT** — `webcams.nyctmc.org` | USA · NYC | — | — | — | — | non raggiungibile | — | — | — | Non verificata |
| **Oregon TripCheck** | USA · OR | 1.160 | SNAP | No | €0 | assente | — | File JS interno alla mappa, non API pubblica | — | **NO** |
| OHGO, UDOT, 511WI, Trafikverket, Statens vegvesen | USA / SE / NO | — | — | **Sì** (registrazione) | €0 ma key | — | — | — | — | **NO** (policy no key) |
| Autostrade per l'Italia, A22, ANAS | Italia | — | pagine HTML | — | — | — | — | Nessun catalogo né licenza open trovati | — | Solo **LINK** futuro, curato a mano, se ammesso |
| Windy Webcams API | Globale | — | — | **Sì** | tier Professional **a pagamento**; token immagini free che scadono in 10 min | — | — | Commerciale | — | **NO** |
| OpenCCTV, SkylineWebcams, YouTube hardcoded, ipcamlive, rtsp.me | Varie | — | — | — | — | — | Sì in OSIRIS | Commerciali/terze parti, hotlink protetto | — | **NO** |

**Mixed content:** tutte le fonti consigliate sono **https** end-to-end (catalogo, JPEG, HLS). Caltrans ha 1 URL http su 3.591, da scartare in fase di normalizzazione.

---

## 4. QUARTA PARTE — Architettura EarthRadar CAM (minima e robusta)

Risposte ai punti A–H:

- **A) Catalogo statico versionato: SÌ, è il cuore della proposta.**
  - `scripts/buildCamCatalog.mjs`, lanciato **a mano** (`npm run cams`) come già `npm run baseline` per la baseline sismica, scarica i cataloghi ufficiali.
  - Lo script valida (https, host in allowlist, lat/lon validi, `inService/available`), normalizza e scrive `public/cam/<source>.json` compatti. Il risultato si committa.
  - **La CI non chiama le fonti**: la build resta deterministica e non si rompe se una fonte è giù.
  - Aggiornamento del catalogo: manuale, ogni 1–3 mesi.
  - Le **immagini** sono sempre live dalla fonte, quindi un catalogo "vecchio" non mostra dati vecchi. Al massimo una camera dismessa va in errore e appare come "non disponibile".
  - Vantaggi:
    - elimina il problema CORS (catalogo same-origin): NZTA e DriveBC diventano utilizzabili;
    - elimina il peso Caltrans (15 MB diventano circa 250 KB);
    - elimina il rischio che un catalogo compromesso inietti URL arbitrari a runtime.
- **B) Marker solo con CAM ON: SÌ.** `lazy()` + fetch del catalogo al primo ON, cache idb-keyval (`apiCache`, TTL 7 giorni) + runtime cache del Service Worker.
- **C) Filtro per viewport: SÌ**, in memoria. Il catalogo intero (poche migliaia di punti) si scarica una volta; il rendering riguarda **solo i punti nel bbox corrente**, aggregati. Un tiling geografico del catalogo non serve sotto le ~20k camere.
- **D) Sorgente originale diretta: SÌ.**
  - `<img src="https://…ufficiale…">` con `referrerPolicy="no-referrer"`, `loading="lazy"`, `decoding="async"`.
  - HLS Caltrans in `<video>`.
- **E) Nessun proxy video: SÌ, eliminato del tutto.**
- **F) Link-out: SÌ**, come stato **LINK** esplicito per fonti senza licenza chiara per l'embedding, e come pulsante "Apri sorgente" su ogni card (pagina ufficiale della fonte o URL immagine originale).
- **G) Clustering senza dipendenze: SÌ.**
  - `src/lib/camCluster.ts`: grid clustering in spazio pixel (celle di ~60 px al livello di zoom corrente), O(n) sul viewport, ~80 righe, testabile in Vitest.
  - `leaflet.markercluster` non serve (dipendenza più DOM per ogni marker).
  - In 2D i cluster sono `divIcon` con il conteggio, i singoli sono `CircleMarker` su `L.canvas()`, un solo renderer canvas per il layer.
  - Click su un cluster: `fitBounds` o zoom +2.
- **H) 2D + 3D senza duplicare logica: SÌ.**
  - Un solo hook `useCamCatalog(enabled)`, un solo `camCluster`, un solo `CamCard`.
  - La 2D rende in un `Popup` Leaflet. La 3D aggiunge `kind: 'cam'` a `pointsData` di `Globe3D` (cluster per altitudine della camera, cap 500 punti come FIRMS) e mostra `CamCard` in una card assoluta sopra il globo.

### 4.1 Architettura in 10 punti
1. **`scripts/buildCamCatalog.mjs`** (manuale, Node, zero deps): fetch dei cataloghi ufficiali, poi validazione e normalizzazione, poi `public/cam/{tfl,digitraffic,hktd}.json` (+ `caltrans.json` in v1b) e `public/cam/index.json` con metadati: fonte, licenza, attribuzione, data di generazione, conteggi.
2. **Formato compatto:**
   - `{"v":1,"src":"tfl","gen":"2026-…","cams":[[id,lat,lon,name,kind,ref],…]}` con `kind ∈ {"S","L","K"}` (SNAP/LIVE/LINK) e `ref` = **solo l'identificativo**, non l'URL.
   - Gli URL si ricostruiscono lato client da template fissi per fonte (`camSources.ts`).
   - Un catalogo modificato non può quindi puntare a host arbitrari.
3. **`vite.config.ts`:**
   - `globIgnores += ['**/cam/**']`, così il catalogo non è precachato e con CAM OFF il traffico è zero;
   - runtime caching `StaleWhileRevalidate` per `/EarthRadar/cam/`;
   - **`NetworkOnly`** per gli host immagine CAM: niente snapshot vecchi dal Service Worker, niente centinaia di MB in cache.
4. **Store:**
   - `LayerId += 'cam'`, `DEFAULT_OVERLAYS.cam = ov(false,1)`;
   - `selectedCam: {src,id} | null` transiente;
   - `camSources: string[]` (filtro fonti, persistito);
   - `cam.enabled` **forzato a false in `partialize`**.
5. **`useCamCatalog(enabled)`:**
   - con enabled=false non esegue nessuna richiesta;
   - altrimenti `cachedFetchTraced` per ogni fonte attiva, con fallback su stale;
   - espone `source` per `SourceBadge`.
6. **`CamLayer.tsx` (2D, lazy):**
   - bbox e zoom da `useMapEvents`;
   - filtro nel viewport, poi `camCluster`, poi rendering di cluster e singoli (cap 1.000 elementi disegnati).
   - Nessuna immagine caricata dai marker.
7. **`CamCard.tsx`:**
   - nome, località, fonte + licenza, badge **LIVE / SNAP / LINK**, "ultimo aggiornamento" (dal `Last-Modified` quando disponibile, altrimenti "ora del caricamento").
   - SNAP: **una sola** `<img>` alla volta, refresh con cache-buster ogni 60 s (TfL, HK) o 5 min (FI), **solo mentre la card è aperta e la tab è visibile** (`document.visibilityState`).
   - LIVE: `<video>` HLS **solo su richiesta** (pulsante ▶), mai in autoplay.
   - LINK: solo pulsante esterno `rel="noopener noreferrer"`.
   - In caso di errore o immagine assente: stato "non disponibile" + link alla sorgente.
8. **LIVE senza dipendenze in v1b:**
   - riproduzione HLS nativa dove `video.canPlayType('application/vnd.apple.mpegurl')` è vero (Safari macOS/iOS e altri browser con HLS nativo);
   - altrove la card mostra lo SNAP e l'indicazione "stream LIVE disponibile"; il pulsante apre la playlist o il portale ufficiale.
   - `hls.js` (~150 KB, lazy, solo nel chunk della card) resta una **decisione esplicita rimandata** (§7.3).
9. **3D:** `Globe3D` aggiunge i punti `cam` (cluster per altitudine, cap 500), `onPointClick` imposta `selectedCam`, `CamCard` compare in overlay. Gli hook sono gli stessi della 2D.
10. **UI e testi:**
    - riga `CamRow` in `LayerPanel` (toggle + filtro per fonte + nota "immagini caricate dalla fonte solo al click");
    - stringhe in `i18n/{it,en}.json`;
    - attribuzione obbligatoria per fonte, sempre visibile nella card e nel badge;
    - voce in Education/About;
    - CHANGELOG.

---

## 5. QUINTA PARTE — Performance

| Aspetto | Stima / scelta |
|---|---|
| **Dimensione catalogo** | ~45–60 byte/camera in forma di array → v1 (≈2.600): ~140 KB raw, **~35–45 KB gzip**. Con Caltrans (≈6.000): ~330 KB raw, **~80–100 KB gzip**. Un solo download al primo ON, poi cache. |
| **Memoria browser** | 6.000 tuple ≈ 1–2 MB heap. Trascurabile. |
| **Rendering marker** | Il viewport a zoom 3–5 genera decine di cluster; sopra zoom 10 decine o centinaia di singoli. Canvas renderer + cap di 1.000 elementi → nessun DOM per migliaia di marker. |
| **Clustering** | Grid O(n) ricalcolato solo a `moveend/zoomend`, sotto 5 ms per 6k punti anche su iPhone medio. |
| **Traffico** | CAM OFF: **0 byte**. CAM ON: catalogo (≤100 KB gzip) una volta. Preview: **una JPEG** (~20–60 KB) per la sola camera aperta, ogni 60 s–5 min. HLS solo su richiesta. **Mai** preview multiple. |
| **Refresh snapshot** | Solo con card aperta e tab visibile; stop immediato alla chiusura. Frequenza allineata a quella della fonte (TfL ~5 min, HK ~2 min, FI ~10 min): controllo ogni 60 s e sostituzione solo se l'immagine è cambiata. |
| **PWA / offline** | Il catalogo resta disponibile offline (SWR + idb). Le immagini offline no, per scelta: la card mostra "richiede connessione". Precache invariato. |
| **Bundle** | Chunk lazy `CamLayer` + `CamCard` + `camCluster` stimato in **< 12 KB gzip**. `index` e `Home` non crescono in modo misurabile (solo la riga `CamRow` e le stringhe i18n, < 1 KB). |
| **Avvio EarthRadar** | Invariato: nessun import eager, nessun fetch, nessun precache aggiuntivo. |
| **3D** | +≤500 punti `pointsData`, sotto il budget attuale (FIRMS 500 + quakes). `usePerfFallback` continua a proteggere. |

---

## 6. SESTA PARTE — Sicurezza e privacy

| Rischio | Stato con l'architettura proposta |
|---|---|
| **Mixed content** | Eliminato: lo script scarta le camere non-https. |
| **CORS** | Eliminato: il catalogo è same-origin; le immagini sono `<img>`/`<video>`, senza fetch né canvas. |
| **CSP** | Oggi nessuna CSP. CAM non ne richiede. Se in futuro si aggiunge, `img-src` e `media-src` vanno estese solo agli host in allowlist (`s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk`, `weathercam.digitraffic.fi`, `tdcctv.data.one.gov.hk`, `cwwp2.dot.ca.gov`, `wzmedia.dot.ca.gov`). |
| **Open redirect** | Eliminato: nessun parametro URL di CAM genera redirect; gli URL esterni si costruiscono da template fissi + id. |
| **SSRF** | Non applicabile: **nessun proxy**, nessun server. |
| **URL non affidabili** | Il catalogo contiene solo id; host e schema sono codificati nel codice (`camSources.ts`) e testati. Lo script rifiuta record con id fuori pattern (`/^[A-Za-z0-9._-]{1,64}$/`). |
| **Tracking di terze parti** | Nessuna richiesta verso terzi finché l'utente non apre una camera. Poi una richiesta verso l'host ufficiale della sola camera scelta, con `referrerPolicy="no-referrer"`. Niente iframe, niente YouTube, niente SDK. |
| **Esposizione API key** | Nessuna key esiste. Nulla da esporre. |
| **Camera non disponibile** | `onError` sull'immagine mostra "non disponibile" + link alla fonte. Nessun retry aggressivo (backoff: si riprova al refresh successivo, al massimo 3 volte, poi stop). |
| **Sorgente compromessa o cambiata** | Il contenuto dell'immagine non è controllabile (vale per ogni hotlink). La mitigazione è strutturale: solo enti pubblici, solo host in allowlist, niente HTML o iframe di terzi, quindi nessuna esecuzione di script remoto. Se una fonte cambia formato, lo script di build fallisce **prima** del commit (validazione rigida + conteggi minimi attesi). |
| **Privacy / GDPR** | Camere di traffico pubblicate dagli stessi enti, a bassa risoluzione. EarthRadar **non registra né archivia** immagini. Disclaimer nella card: "Immagini pubblicate da <ente>. EarthRadar non le memorizza." |

---

## 7. SETTIMA PARTE — GO / NO-GO

### **GO CON LIMITI**

I limiti sono deliberati:
- solo fonti ufficiali open data;
- solo SNAP in v1 (LIVE Caltrans in v1b, nativo senza nuove dipendenze);
- niente Italia in v1, perché non esiste un catalogo ufficiale open (eventuali LINK curati a mano solo dopo aver verificato i termini);
- nessuna copertura "globale".

### 7.1 Sorgenti iniziali
- **v1:** TfL JamCams, Fintraffic Digitraffic, Hong Kong Transport Department.
- **v1b:** Caltrans (SNAP + LIVE HLS nativo).
- **v1.1 (valutazione):** NZTA, DriveBC, USGS HVO curate; hls.js lazy.

### 7.2 Quante camere
- **v1:** ≈ **2.600** (812 TfL disponibili + 809 FI + ~1.000 HK), tutte SNAP.
- **v1b:** ≈ **6.000** (+3.400 Caltrans, di cui ~2.300 LIVE).
- Obiettivo "500 affidabili" ampiamente superato **senza** ricorrere a fonti instabili. Se si preferisce un debutto ancora più contenuto, il filtro fonti permette di pubblicare anche una sola fonte.

### 7.3 Decisioni da prendere all'autorizzazione
1. Includere Caltrans già in v1 (6.000 camere + LIVE nativo) o tenerlo in v1b?
2. LIVE su browser senza HLS nativo: accettare "SNAP + link" in v1, oppure aggiungere `hls.js` come dipendenza lazy (gratuita, Apache-2.0) in v1.1?
3. Confermare che `cam.enabled` **non** va persistito (CAM sempre OFF all'avvio).

### 7.4 File da modificare
- `src/store/layersStore.ts`: `LayerId 'cam'`, default OFF, `selectedCam`, `camSources`, `partialize`/`merge`, bump `version`.
- `src/pages/Home.tsx`: lazy `CamLayer` in `Map2D`, `SourceBadge` CAM.
- `src/components/maps/Globe3D.tsx`: `kind: 'cam'` in `pointsData`, click, overlay `CamCard`.
- `src/components/panels/LayerPanel.tsx`: `CamRow`.
- `src/i18n/it.json`, `src/i18n/en.json`.
- `vite.config.ts`: `globIgnores` per `cam/**`, runtime caching catalogo (SWR) e immagini (`NetworkOnly`).
- `package.json`: solo script `"cams": "node scripts/buildCamCatalog.mjs"`, **nessuna dipendenza**.
- `src/pages/education/educationData.ts` (+ eventualmente `About.tsx`): fonti e licenze.
- `CHANGELOG.md`, `README.md`.

### 7.5 File da creare
- `scripts/buildCamCatalog.mjs`
- `public/cam/index.json`, `public/cam/tfl.json`, `public/cam/digitraffic.json`, `public/cam/hktd.json` (generati; `caltrans.json` in v1b)
- `src/services/camSources.ts`: registro fonti, template URL, allowlist host, licenze, attribuzioni, frequenze
- `src/services/camCatalog.ts`: parse e validazione del formato compatto
- `src/hooks/useCamCatalog.ts`
- `src/lib/camCluster.ts`
- `src/components/overlays/CamLayer.tsx`
- `src/components/panels/CamCard.tsx`
- Test: `src/services/camSources.test.ts` (template, host, https), `src/services/camCatalog.test.ts` (validazione, record scartati), `src/lib/camCluster.test.ts`, `src/store/layersStore.cam.test.ts` (default OFF, non persistito), `src/pages/Home.cam.test.tsx` (CAM OFF: nessun fetch verso `/cam/`)

### 7.6 Infrastruttura e costi
| Voce | Risposta |
|---|---|
| Nuove dipendenze | **Nessuna** in v1/v1b (hls.js solo opzionale in v1.1) |
| Backend | **No** |
| Cloudflare Worker | **No** (il gateway aerei resta invariato e non viene toccato) |
| API key | **No** |
| Carta di credito / trial / SaaS | **No** |
| Proxy stream | **No** |
| Hosting | GitHub Pages esistente (catalogo < 100 KB gzip) |
| **Costo previsto** | **€0**, senza costi proporzionali a utenti o traffico: il traffico immagini va direttamente dal browser all'ente pubblico |

### 7.7 Ordine esatto delle modifiche (branch `feat/cam-layer` + PR, come da CLAUDE.md)
1. `src/services/camSources.ts` + test (registro fonti, template, allowlist).
2. `scripts/buildCamCatalog.mjs`; esecuzione; commit dei `public/cam/*.json` generati (conteggi verificati a mano).
3. `src/services/camCatalog.ts` + test.
4. `src/lib/camCluster.ts` + test.
5. `vite.config.ts`: `globIgnores` + runtime caching; verifica su `dist/sw.js` che `cam/` non sia nel precache.
6. `layersStore`: `'cam'` OFF, non persistito, `selectedCam`, `camSources` + test.
7. `useCamCatalog` + test "OFF → zero fetch".
8. `CamCard` (SNAP / LINK; LIVE nativo se v1b).
9. `CamLayer` 2D + integrazione in `Home.tsx`.
10. `CamRow` in `LayerPanel` + i18n it/en.
11. Integrazione `Globe3D` (punti + overlay card).
12. Education/About, CHANGELOG, README.
13. `npm run lint`, `npm test`, `npm run build`. Prova manuale desktop e iPhone, 2D e 3D, CAM OFF: tab Network senza richieste `/cam/` né verso host CAM.

### 7.8 Rischi residui
- **Stabilità degli endpoint:** un cambio di formato rompe solo lo script di build, non l'app (il catalogo committato resta valido). Camere dismesse compaiono come "non disponibile" fino al rigenero.
- **Termini:** Caltrans prevede "unless otherwise indicated" (alcune immagini potrebbero avere copyright); TfL chiede attribuzioni precise (TfL + OS/Geomni). Da riportare letteralmente nella card.
- **Mobile e pannelli dettaglio:** il pattern attuale (detail panel nascosto sotto `lg`) non va riusato per CAM; serve il `Popup` o l'overlay card previsto.
- **LIVE su Chrome/Firefox desktop:** senza hls.js nessuna riproduzione in-app, solo SNAP + link (decisione 7.3.2).
- **NYC DOT, Georgia, Florida, Italia:** non verificate o senza catalogo aperto; escluse.
- **Singapore:** solo 8 camere oggi; esclusa finché non si stabilizza.

### 7.9 Rispetto dei requisiti di accettazione
| # | Requisito | Come |
|---|---|---|
| 1 | App identica con CAM OFF | lazy, nessun precache, nessun fetch, test dedicato |
| 2 | OFF di default | `ov(false)` + non persistito |
| 3 | Camere reali geolocalizzate | solo cataloghi ufficiali, coordinate dell'ente |
| 4 | Nessuna camera inventata | lo script scarta record senza id/coordinate/https; nessuna voce manuale in v1 |
| 5 | Attribuzione | `camSources.ts` → card + badge |
| 6 | LIVE/SNAP/LINK corretti | `kind` dal tipo reale: HLS = LIVE; JPEG/MP4-clip = SNAP |
| 7 | Nessun segreto | nessuna key esiste |
| 8–11 | Nessuna API commerciale, carta, costo server o proxy | architettura statica + hotlink ufficiale |
| 12 | Desktop + mobile | Popup 2D / overlay 3D, canvas renderer, cap |
| 13 | Non rompe 2D/3D | integrazione additiva, stessi pattern esistenti |
| 14 | test/build/lint | nessuna modifica ai test esistenti; nuovi test isolati |
| 15 | €0 | §7.6 |
