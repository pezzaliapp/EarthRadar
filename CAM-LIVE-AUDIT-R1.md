# CAM-LIVE-AUDIT-R1 — Webcam LIVE (video reale) per EarthRadar

**Data:** 2026-09-28 (prove eseguite fra 18:45 e 21:10 UTC, da IP italiano)
**Natura:** solo audit tecnico/legale. Nessun file applicativo, catalogo o CAM Explorer modificato. Nessun commit, nessun push.
**Metodo:** richieste HTTP reali con `Origin: https://www.alessandropezzali.it` e **senza Referer**. Nessun header falsificato, nessuna protezione aggirata. Per ogni media sono registrati solo dati tecnici: status, Content-Type, manifest, numero di sequenza, segmenti, CORS. Nessun video archiviato: letture parziali di pochi KB, catture MJPEG di al massimo 30 s cancellate subito.
**Vincoli:** costo €0; nessuna API key, backend, proxy o Worker; niente scraping fragile come fondamento.

---

## 1. Executive summary

- **I video LIVE istituzionali, riproducibili direttamente da una pagina terza, esistono. Oggi solo in Nord America e a Taiwan.**
- **In Europa e in Italia non esiste nessuna fonte istituzionale LIVE utilizzabile.** Italia ed Europa pubblicano immagini o brevi clip MP4. L'unica rete europea con video vero (Verkeerscentrum Vlaanderen) vieta esplicitamente l'embedding.
- **Hong Kong Traffic Webcast: NO-GO.** Le API rispondono 403 a chi non è il sito ufficiale e le condizioni vietano la ritrasmissione.
- **Migliore fonte: Caltrans (California).**
  - 3.591 CCTV a catalogo, 2.180 URL `streamingVideoURL` in servizio.
  - **1.485 stream HLS realmente attivi, misurati uno per uno.**
  - Tutti in HTTPS, CORS `*` su playlist e segmenti, senza token, cookie o Referer.
  - La stessa Caltrans li pubblica nel dataset ufficiale e li riproduce nelle sue pagine "Live Traffic Cameras – Individual Links" (video.js 7.20.3 sugli stessi URL).
- **Seconda fonte: Iowa DOT.**
  - 1.258 camere, 700 con `VideoURL` (HLS fMP4), circa 92% attivi.
  - **Licenza CC BY 4.0 che cita esplicitamente il "motion video URL"**: è la fonte legalmente più pulita trovata.
- **Altre candidate tecnicamente valide:**
  - VDOT Virginia (circa 1.650), MnDOT Minnesota (circa 1.250): termini da confermare.
  - Taiwan THB (2.329 MJPEG, licenza aperta governativa, avvio lento).
- **Dipendenza:** tutti gli stream HLS trovati sono H.264.
  - Safari/iOS li riproduce **nativamente**.
  - Per Chrome, Firefox e Android serve **hls.js** (Apache-2.0, circa 119–188 KB gzip, caricabile solo all'apertura di una camera LIVE). Il supporto HLS nativo di Chrome non è verificato.
  - Taiwan (MJPEG in `<img>`) funziona senza dipendenze.
- **Raccomandazione: GO CON LIMITI per CAM LIVE v1.**
  - Fonti: Caltrans + Iowa DOT, circa 2.100 stream LIVE.
  - Un solo stream alla volta, avviato solo su richiesta.
  - La decisione su hls.js spetta a te: senza, il LIVE funziona solo su Safari/iOS.

---

## 2. Definizione LIVE vs SNAP (usata in tutto il documento)

| Categoria | Definizione | Esempi trovati |
|---|---|---|
| **LIVE** | Flusso video continuo o quasi, prodotto dalla camera e servito come stream: HLS con playlist che avanza, MJPEG `multipart/x-mixed-replace`, fMP4 live. | Caltrans, Iowa, VDOT, MnDOT, Taiwan |
| **CLIP** | Breve file video registrato (10–15 s), rigenerato ogni pochi minuti. **Non è LIVE.** | TfL JamCams `.mp4`, SATAP/ASTM `.mp4` |
| **SNAP** | Immagine JPEG aggiornata periodicamente, anche se il sito la chiama "live". | Le 2.629 camere attuali, DGT, ASPI, NZTA, NSW, Singapore |

**Criterio di prova LIVE usato:**
- **HLS:** playlist media scaricata due volte a circa 25 s di distanza; `#EXT-X-MEDIA-SEQUENCE` deve aumentare e i nomi dei segmenti cambiare. Segmento verificato come `video/MP2T` (sync byte 0x47) oppure `video/mp4` (box `moof`).
- **MJPEG:** conteggio dei fotogrammi JPEG **distinti** (hash) ricevuti sulla stessa connessione in 10–30 s.

---

## 3. Risultati Caltrans (verificati direttamente)

### 3.1 Numeri
| Voce | Valore | Come |
|---|---|---|
| CCTV totali (12 distretti, `cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json`) | **3.591** | conteggio sul JSON ufficiale |
| In servizio (`inService=true`) | **3.408** | idem |
| Con `streamingVideoURL` valorizzato | **2.305** (tutti su `wzmedia.dot.ca.gov`) | idem |
| `streamingVideoURL` https + in servizio | **2.180** (1 URL `http://`, 1 malformato `ttps://`) | idem |
| **Stream realmente attivi (playlist 200)** | **1.485 / 2.180 = 68%** | scansione di tutte le playlist, 6 richieste parallele, 18 min |
| Offline (404) | 693 (+1 × 403, +1 errore) | idem |
| ArcGIS FeatureServer `CHhighway/CCTV/FeatureServer/0` | 2.936 record, 1.959 con URL streaming `https…` | `returnCountOnly` (dataset parallelo, meno aggiornato) |

**Stream attivi per distretto:**

| Distretto | Attivi / URL https in servizio |
|---|---|
| D1 | 6 / 13 |
| D2 | 0 / 0 (nessuno stream) |
| D3 | 237 / 267 |
| D4 (Bay Area) | 107 / 195 |
| D5 | 175 / 178 |
| D6 | 93 / 122 |
| D7 (Los Angeles) | 124 / 398 |
| D8 | 292 / 397 |
| D9 | 0 / 0 (nessuno stream) |
| D10 | 132 / 148 |
| D11 | 131 / 235 |
| D12 | 188 / 227 |

**Risoluzioni degli stream attivi:**

| Risoluzione | Stream |
|---|---|
| 1280×720 | 315 |
| 352×288 | 249 |
| 720×480 | 239 |
| 640×480 | 151 |
| 768×432 | 132 |
| 896×504 | 107 |
| 1920×1080 | 82 |
| 320×240 | 54 |
| altre | poche unità |

> **Importante:** `streamingVideoURL` (video HLS) e `currentImageURL` (JPEG `cwwp2.../image/...jpg`, aggiornato ogni 1–2 min) sono **campi e infrastrutture diversi**. Solo il primo è LIVE.

### 3.2 Prova reale su 30 stream distribuiti su tutti i distretti con stream
- **21/30** playlist master 200; **9/30** 404, confermati al secondo tentativo (URL a catalogo ma stream spento).
- **21/21** attivi: `EXT-X-MEDIA-SEQUENCE` aumentata di 2–3 segmenti in 25 s. Esempi:
  - D7 `CCTV-196`
  - D3 1.083→1.085 · 51.684→51.686
  - D4 127.368→127.371
  - D6 75→78 (1920×1080)
  - D10 54.462→54.464
  - D11 78.030→78.032 (1280×1024)
  - D12 6.637→6.640
- Segmenti: `206`, `Content-Type: video/MP2T`, sync byte 0x47, `Access-Control-Allow-Origin: *`. 4 segmenti hanno dato un 404 transitorio (bordo della finestra live), 206 al secondo tentativo.
- Codec: H.264 (`avc1.*`), `#EXT-X-TARGETDURATION` 10–14 s, segmenti da circa 10 s.
- **Latenza stimata:** 20–40 s (3 segmenti in playlist).

### 3.3 Scheda
| Campo | Valore |
|---|---|
| SOURCE | Caltrans CWWP2 CCTV (`cctvStatusDNN.json`) + `wzmedia.dot.ca.gov` (Wowza) |
| PAESE/AREA | USA · California |
| ENTE | California Department of Transportation |
| CAM TOTALI | 3.591 |
| LIVE REALI | **1.485** (misurati) |
| TIPO | MIXED (LIVE + SNAP) |
| PROTOCOLLO | HLS (MPEG-TS, H.264) |
| ESEMPIO | `https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8` → `chunklist_w<id>.m3u8` |
| HTTPS | SÌ |
| CORS | SÌ: `*` su master, chunklist e segmenti |
| TOKEN | NESSUNO (`chunklist_w<numero>` è un id di sessione Wowza generato dal server, non autenticazione) |
| COOKIE/SESSIONE | NO |
| REFERER | NO (testato senza) |
| DIRETTO DA BROWSER TERZO | SÌ a livello HTTP. **Riproduzione in un browser reale non verificata** (estensione browser non disponibile) |
| SAFARI/iOS | SÌ atteso: HLS nativo, stesso player della pagina ufficiale. DA VERIFICARE su dispositivo |
| CHROME | Serve **hls.js** (supporto nativo DA VERIFICARE). La pagina ufficiale Caltrans usa video.js 7.20.3, che include un motore HLS |
| AGGIORNAMENTO | Continuo, segmenti da 10 s |
| COSTO | €0 · "no charge for the use of this data" |
| API KEY | NO |
| CONDIZIONI | `dot.ca.gov/conditions-of-use`: "Information presented on this website, unless otherwise indicated, is considered in the public domain"; "Caltrans does make use of copyrighted data (e.g., photographs) which may require additional permissions". Nessuna clausola su embedding o hotlink. Il portale indica "Caltrans traffic camera video footage and still images are neither retained nor archived" |
| ATTRIBUTION | Non obbligatoria; consigliata "Video: Caltrans (California DOT)" |
| RISCHIO TECNICO | MEDIO: il 32% degli URL a catalogo è spento, quindi serve una verifica di disponibilità al build; server unico `wzmedia` |
| RISCHIO LEGALE | BASSO-MEDIO: pubblico dominio "salvo diversa indicazione"; gli URL sono pubblicati da Caltrans stesso per la visione nel browser |
| **VERDETTO** | **GO CON LIMITI:** solo stream verificati al build, riproduzione su richiesta, attribuzione Caltrans |

---

## 4. Risultati Hong Kong Traffic Webcast

| Campo | Valore |
|---|---|
| SOURCE | HKeMobility Traffic Webcast (`hkemobility.gov.hk/en/traffic-information/live/webcast`) |
| TECNOLOGIA | SPA Vue + video.js; lista via `POST /api/em {"api":"getTrafficWebcast"}`; stream `src:"/api/cctv/<URL_LOC>/"` di tipo `application/x-mpegURL` (HLS via MSE). Un gruppo di area = **un solo stream** che cicla 5 camere × 8 s (Tuen Mun 10 × 8 s) |
| VERO STREAM? | Sì (sequenza video lato server), ma **non accessibile a terzi** |
| INFRASTRUTTURA | Diversa dagli SNAP: webcast su `www.hkemobility.gov.hk/api/*` (Tencent EdgeOne); snapshot su `tdcctv.data.one.gov.hk` (Cloudflare, ACAO `*`) |
| ACCESSO | **403** "Forbidden to view/access this resource" su tutti gli `/api/*`, con o senza Origin, con il Referer reale di EarthRadar, anche da un'uscita di rete USA; nessun ACAO |
| LIMITE 2 MINUTI | Solo lato client: `setTimeout(pause, 120000)` nel bundle JS, senza token |
| STATO | Codice presente in produzione; **operatività non verificabile dall'esterno** |
| GRUPPI | Non misurabili (lista in 403) |
| CONDIZIONI | Avviso di proprietà intellettuale: senza autorizzazione scritta sono vietate "reproduction, … redistribution, … transmission, retransmission, … making available of the Work to the public". Nessun dataset webcast su DATA.GOV.HK |
| RISCHIO | TECNICO ALTO · LEGALE ALTO |
| **VERDETTO** | **NO-GO.** Le 1.011 camere HK attuali restano SNAP (open data, corrette) |

---

## 5. Risultati della ricerca mondiale

### 5.1 USA / Canada
| Fonte | Camere / LIVE | Protocollo | CORS | Token / Key | Condizioni | Verdetto |
|---|---|---|---|---|---|---|
| **Iowa DOT**, ArcGIS `Traffic_Cameras_View` | 1.258 / **700** URL, circa 92% attivi | HLS v10 **fMP4** (MediaMTX), 480×270 15 fps, **porta 8888** | `*` su catalogo, playlist e segmenti | nessuno | **CC BY 4.0**; la descrizione cita "static image URL, and motion video URL"; più Iowa DOT GIS Terms ("as is") | **GO** |
| **VDOT Virginia**, `511.vdot.virginia.gov/services/511/map/layers/map/cams` | 1.649 / circa 90% attivi | HLS TS (Wowza), 320×240 | `*` | nessuno | Linee guida VDOT/FHWA: video gratuito "for … free distribution to the public", **attribuzione VDOT obbligatoria**; endpoint interno, canale ufficiale SmarterRoads (registrazione) | **GO CON LIMITI** (conferma scritta consigliata) |
| **MnDOT Minnesota**, 511mn GraphQL | 1.248 video / circa 82% | HLS TS (Wowza) fino a 1080p, fino a 4 Mbps | `*` | nessuno (cookie sticky non necessario) | Nessun termine scritto trovato | **GO CON LIMITI** (chiedere conferma a MnDOT) |
| Maryland CHART (Socrata `hua3-qc8n`) | 451 feed, host stream non pubblicato (circa 58% trovati) | HLS TS | `*` | nessuno | Solo disclaimer open data; iframe ufficiale offerto | DA VERIFICARE |
| Louisiana DOTD (511la) | 491 video / circa 95% | HLS TS | `*` | API ufficiale con key gratuita | Nessun termine trovato | DA VERIFICARE |
| 511NY (NYSDOT, skyvdn) | 1.569 video / circa 95% | HLS TS | `*` | key + Developer Access Agreement | Il sito **vieta** "redistribution or republication … including by … framing" senza consenso scritto | **NO-GO** (senza key e accordo) |
| Georgia 511, FL511, 511PA | 3.531 / 4.460 / 1.314 | HLS | — | token di sessione, **401** | — | NO-GO |
| Kansas KanDrive | 201 | HLS | — | JWT valido 300 s | — | NO-GO |
| Nevada, Indiana, Tennessee, Michigan, Québec, NYC DOT | — | HLS | — | server irraggiungibili o 403 WAF dall'Italia | — | NO-GO per utenti UE |
| Ohio, WSDOT, Oregon, DriveBC, NC, Ontario, Alberta, Nova Scotia, AZ, ID, CT, NE, AK | — | JPEG | — | — | — | SNAP (non LIVE) |

**Iowa: prova reale indipendente (3 stream, 25 s)**
- `video3.iowadot.gov:8888/cedarrapids/ictv04lb`: sequenza 81.204→81.210.
- `video2…/crtv59lb`: sequenza 474.802→474.808.
- `video4…/ankeny/wwdtv072lb`: sequenza 3.895→3.903.
- In tutti e tre: master `application/vnd.apple.mpegurl` ACAO `*`, segmento `200 video/mp4` (box `moof`) ACAO `*`, `#EXT-X-MAP` init.mp4.

### 5.2 Asia-Pacifico
| Fonte | Camere / LIVE | Protocollo | CORS | Condizioni | Verdetto |
|---|---|---|---|---|---|
| **Taiwan THB (Highway Bureau)**, catalogo `cctv-maintain.thb.gov.tw/opendataCCTVs.xml` | **2.329**, tutte con `VideoStreamURL` https; circa 95% attive (campione di 40) | **MJPEG** `multipart/x-mixed-replace;boundary=DIGIEVER` su `cctv-ss01..08.thb.gov.tw:443` | assente (irrilevante per `<img>`); catalogo senza CORS, quindi va letto al build | **Open Government Data License v1.0** (compatibile CC BY 4.0; riproduzione, distribuzione e trasmissione pubblica consentite) | **GO CON LIMITI** |
| Taiwan Freeway Bureau (1968), `cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=` | non misurato | MJPEG HTTP/2, circa 10 fps | assente | OGDL v1.0; catalogo irraggiungibile dall'estero o con key TDX | DA VERIFICARE |
| Hong Kong webcast | — | HLS/MSE | 403 | ritrasmissione vietata | **NO-GO** |
| NZTA, NSW, QLD, WA, Singapore | — | JPEG | — | — | SNAP (QLD: key) |
| Corea (ITS/UTIC) | — | — | — | key obbligatoria | NO-GO |
| Giappone (MLIT/NEXCO) | — | JPEG / YouTube | — | — | non LIVE diretto |

**Taiwan THB: prova reale indipendente (6 stream su 6 server)**

Con attesa di 10 s: 1/6 risponde (18 fotogrammi distinti), 4 senza header, 1 errore di connessione. Con attesa di 30 s:

| Stream | Fotogrammi / distinti | Tempo | Dati |
|---|---|---|---|
| ss02 `T62-17K+200` | 93 / 93 | 30 s | 1,6 MB |
| ss03 `T65-11K+320` | 58 / 58 | 19 s | — |
| ss04 `T21A-10K+950` | 92 / 92 | — | — |
| ss05 `T28-12K+600` | 88 / 88 | — | — |
| ss01 `T23-016K+498` | 92 / 19 | — | camera quasi ferma |

**Esito:** LIVE reale a circa 3 fps, con **primo byte lento (10–20 s)** e circa 30–65 KB/s continui.

### 5.3 Europa
| Fonte | Tipo | Verdetto |
|---|---|---|
| Verkeerscentrum Vlaanderen (BE) | **LIVE**, ma il player risponde "Content embedding is niet toegelaten op deze site"; snapshot concessi solo con Referer del sito | **NO-GO** (divieto esplicito) |
| TfL JamCams (UK) | CLIP MP4 da circa 11 s, rigenerate ogni circa 7–8 min (OGL) | Non LIVE (eventuale "clip recente") |
| National Highways, Traffic Scotland, TrafficwatchNI | JPEG | SNAP |
| Autobahn GmbH (DE), API `…/services/webcam` | endpoint vuoto su tutte le strade | NO-GO |
| DGT (ES), NAP DATEX2 | 1.952 camere, tutte JPEG | SNAP |
| Bison Futé / DIR, Grand Lyon (FR) | JPEG (Lyon: "images extraites toutes les minutes du flux vidéo") | SNAP |
| DARS promet.si (SI) | JPEG ogni 5 min | SNAP |
| Infraestruturas de Portugal | menu "Câmaras" commentato nell'HTML | DA VERIFICARE (probabilmente dismesso) |
| Nordici, Baltici, Irlanda TII, Rep. Ceca, Croazia, Polonia GDDKiA, Lussemburgo | nessun m3u8/mp4 trovato; noti come immagini (Trafikverket: key) | SNAP / non verificati a fondo |
| Paesi Bassi (RWS), Svizzera, Austria (ASFINAG) | nessuna camera pubblica / solo commerciali / unico accesso con credenziali estratte (OSIRIS) | NO-GO |
| HLS privati (es. operatore via cavo polacco, Wowza) | LIVE reale, CORS `*`, **nessuna licenza** | NO-GO come fonte primaria |

---

## 6. Italia

**Risultato: 0 fonti istituzionali LIVE utilizzabili.**

| Fonte | Cosa pubblica | Catalogo/licenza | Verdetto |
|---|---|---|---|
| Autostrade per l'Italia | oltre 1.000 telecamere, immagini "distribuite sotto forma di frame" (informativa privacy webcam ASPI v2.1) | nessun endpoint documentato né licenza | NO-GO |
| A22 Autostrada del Brennero | 13 camere JPEG; 8 nell'Open Data Hub Alto Adige con licenza **CC0** | CC0 via ODH | NO-GO LIVE · **candidata SNAP** |
| SATAP A4 / gruppo ASTM (SALT, Fiori, Asti-Cuneo, Autovia Padana, SAV) | circa 51 **clip MP4 da 15 s** + JPEG | nessuna nota legale; CSP `frame-ancestors` | NO-GO LIVE · clip solo con permesso scritto |
| Autostrade Alto Adriatico | 25 JPEG con cookie di sessione | nessuna | NO-GO |
| ANAS (VAI) | "immagini in diretta", nessun endpoint pubblico | nessuna | NO-GO |
| CAV, Serravalle, Pedemontana, Brebemi, Strada dei Parchi | nessuna webcam pubblica trovata | — | NO-GO |
| Open Data Hub Südtirol (`WebcamInfo`) | 1.963 webcam (in prevalenza Feratel/Panomax commerciali), `StreamUrl` = pagine player, non stream | CC0 solo per A22 | Solo catalogo SNAP |
| Provincia di Trento (SDI) | JPEG orari, solo HTTP | — | NO-GO (mixed content) |
| dati.gov.it | dataset di posizioni (varchi, ZTL), nessun feed | — | NO-GO |
| CCISS, ARPA, Comuni di Milano/Roma, Regioni | nessun dataset video trovato | non verificati uno per uno | — |

In Italia gli enti pubblicano fotogrammi o clip, senza licenze di riuso per il video.

---

## 7. Tabella completa delle fonti (sintesi)

| # | Fonte | Area | LIVE stimati | Protocollo | Key | CORS | Rischio tecnico | Rischio legale | Verdetto |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Caltrans** | USA-CA | **1.485** (misurati) | HLS TS | no | `*` | MEDIO | BASSO-MEDIO | **GO CON LIMITI** |
| 2 | **Iowa DOT** | USA-IA | circa 650 | HLS fMP4 :8888 | no | `*` | MEDIO (porta 8888) | **BASSO** (CC BY 4.0) | **GO** |
| 3 | VDOT | USA-VA | circa 1.480 | HLS TS | no | `*` | BASSO | MEDIO-BASSO | GO CON LIMITI |
| 4 | MnDOT | USA-MN | circa 1.020 | HLS TS | no | `*` | MEDIO (banda) | MEDIO | GO CON LIMITI |
| 5 | Taiwan THB | TW | circa 2.200 | MJPEG | no | n/a (`<img>`) | MEDIO-ALTO (avvio 10–20 s) | BASSO-MEDIO (OGDL) | GO CON LIMITI |
| 6 | Maryland CHART | USA-MD | circa 260 | HLS TS | no | `*` | ALTO (host non pubblicato) | MEDIO | DA VERIFICARE |
| 7 | Louisiana DOTD | USA-LA | circa 470 | HLS TS | key gratuita | `*` | MEDIO | MEDIO | DA VERIFICARE |
| 8 | Taiwan Freeway | TW | ? | MJPEG | catalogo con key | n/a | ALTO | BASSO | DA VERIFICARE |
| 9 | 511NY | USA-NY | circa 1.490 | HLS TS | key + accordo | `*` | BASSO | **ALTO** senza accordo | NO-GO |
| 10 | GA / FL / PA / KS | USA | — | HLS con token | — | — | — | — | NO-GO |
| 11 | NV / IN / TN / MI / QC / NYC | USA / CA | — | HLS | — | bloccati dall'UE | — | — | NO-GO |
| 12 | HK Webcast | HK | — | HLS/MSE | — | 403 | ALTO | ALTO | NO-GO |
| 13 | Verkeerscentrum | BE | — | LIVE | — | bloccato | — | ALTO | NO-GO |
| 14 | TfL JamCams | UK | 0 | CLIP MP4 | no | — | BASSO | BASSO | non LIVE |
| 15 | SATAP/ASTM | IT | 0 | CLIP MP4 | no | — | MEDIO | ALTO (nessuna licenza) | non LIVE |
| 16 | Italia / Europa (altri) | — | 0 | JPEG | — | — | — | — | SNAP / NO-GO |
| 17 | YouTube Live | globale | curabili a mano | iframe | no (embed) | — | MEDIO | MEDIO (consenso) | non primaria |
| 18 | Windy / Skyline / EarthCam | globale | — | player proprietari | Windy: key | — | — | ALTO | NO-GO |

---

## 8. LIVE realmente verificati

| Voce | Numero |
|---|---|
| Fonti/reti investigate | **circa 70** (Caltrans; HK webcast; 13 fonti Asia-Pacifico; 33 USA/Canada; 20 fra Europa e Italia; 4 piattaforme commerciali) |
| Fonti con LIVE reale (tecnicamente) | 12 (Caltrans, Iowa, VDOT, MnDOT, Maryland, Louisiana, 511NY, Taiwan THB, Taiwan Freeway, HK webcast, Verkeerscentrum, HLS privati PL) |
| **Fonti LIVE utilizzabili con i nostri vincoli** | **5** (GO: Iowa; GO CON LIMITI: Caltrans, VDOT, MnDOT, Taiwan THB) |
| Stream LIVE stimati nelle 5 fonti | circa **6.800** (Caltrans 1.485 misurati + Iowa circa 650 + VDOT circa 1.480 + MnDOT circa 1.020 + Taiwan circa 2.200) |
| Stream Caltrans con playlist verificata | **1.485** attivi su 2.180 (scansione completa) |
| Stream con prova di avanzamento (sequenza o fotogrammi) | **circa 50**: io 30 (21 Caltrans attivi + 3 Iowa + 6 Taiwan); analisti circa 20 (3 per fonte USA × 6 fonti, 2 Taiwan, 1 privato PL) |
| Campioni di disponibilità degli analisti | circa 250 (40 per fonte USA; 40 Taiwan THB) |

---

## 9. Protocolli trovati

| Protocollo | Dove | Note |
|---|---|---|
| **HLS MPEG-TS** (H.264) | Caltrans, VDOT, MnDOT, Maryland, Louisiana, 511NY | Wowza; segmenti 2–10 s |
| **HLS fMP4 v10** (H.264) | Iowa | MediaMTX; `#EXT-X-MAP` |
| **MJPEG** | Taiwan THB e Freeway | `multipart/x-mixed-replace`, riproducibile in `<img>` |
| HLS via MSE (proprietario) | HK webcast | non accessibile |
| Clip MP4 | TfL, SATAP/ASTM | non LIVE |

Nessuna fonte usa WebRTC, DASH o WebM live.

## 10. Compatibilità browser

| Browser | HLS TS / fMP4 | MJPEG in `<img>` |
|---|---|---|
| Safari macOS, **iOS/iPadOS** | **Nativo** in `<video>` | Sì (storicamente supportato; DA VERIFICARE su dispositivo) |
| Chrome desktop | **hls.js** (HLS nativo DA VERIFICARE: va rilevato a runtime con `canPlayType`) | Sì |
| Chrome Android | hls.js o nativo (DA VERIFICARE) | Sì |
| Firefox | **hls.js** | Sì |

**Da ricordare:**
- Nessuna prova in un browser reale è stata possibile in questa sessione.
- Tutte le verifiche sono a livello HTTP: playlist, segmenti, Content-Type, CORS.
- **Prima di implementare servono 10 minuti di prova manuale su iPhone e Chrome.**

## 11. Condizioni e licenze

| Fonte | Licenza / condizioni | Attribuzione |
|---|---|---|
| Caltrans | Pubblico dominio "unless otherwise indicated"; gratuito; possibili materiali protetti "e.g. photographs" | Consigliata: "Video: Caltrans" |
| Iowa DOT | **CC BY 4.0** (include il "motion video URL") + GIS Terms ("as is", indennità) | **Obbligatoria:** "Iowa Department of Transportation", link alla licenza |
| VDOT | Uso gratuito per distribuzione pubblica; il feed può essere interrotto in ogni momento | **Obbligatoria:** logo VDOT o attribuzione equivalente |
| MnDOT | Non trovate | Da concordare |
| Taiwan THB | Open Government Data License v1.0 | **Obbligatoria:** "交通部公路局 (Highway Bureau, MOTC) — Open Government Data License v1.0" |
| 511NY | Redistribuzione vietata senza accordo | — |
| HK webcast | Ritrasmissione vietata | — |

## 12. Rischi

1. **Stream spenti a catalogo** (Caltrans 32%, MnDOT circa 18%). Mitigazione: verifica di disponibilità nello script di build e badge "non disponibile" a runtime.
2. **Consumo dati.** Fino a 4 Mbps su alcuni stream 1080p (MnDOT); 320×240 circa 10 KB/s. Serve un avvio solo su richiesta e uno stop automatico.
3. **Porte non standard** (Iowa :8888): possono essere bloccate da reti aziendali o scolastiche.
4. **Dipendenza hls.js** per Chrome e Firefox: circa 119–188 KB gzip, solo nel chunk della camera LIVE.
5. **Taiwan MJPEG:**
   - avvio fino a 20 s;
   - server HTTP/1.0: al massimo circa 5 connessioni per host nel browser;
   - lo stream va chiuso esplicitamente (`img.src = ''`).
6. **Geo-blocking USA** (NV, IN, TN): oggi escluse. Anche le fonti GO possono cambiare policy.
7. **Legale:** senza licenza esplicita (MnDOT, Maryland, Louisiana) serve una conferma scritta. Caltrans "unless otherwise indicated": basso ma non nullo.
8. **Privacy:** video di traffico pubblicati dagli enti stessi, a bassa risoluzione. EarthRadar non registra né archivia (coerente con "neither retained nor archived" di Caltrans).

## 13. Fonti NO-GO e perché

| Fonte | Motivo |
|---|---|
| **Hong Kong webcast** | API chiuse a terzi (403) e ritrasmissione vietata |
| **511NY** | La redistribuzione richiede key e accordo scritto |
| **Georgia, Florida, Pennsylvania, Kansas** | Token temporanei (401, JWT da 300 s) |
| **Nevada, Indiana, Tennessee, Michigan, Québec, NYC** | Irraggiungibili o bloccati dall'Italia |
| **Verkeerscentrum Vlaanderen** | Embedding vietato esplicitamente |
| **Italia ed Europa istituzionali** | Solo SNAP o clip; nessun video LIVE con licenza |
| **ASFINAG** | Unico accesso noto con credenziali estratte |
| **HLS privati senza licenza** (es. Polonia) | Rischio legale alto |
| **Windy** | Key obbligatoria, token delle immagini in scadenza, player proprietario |
| **SkylineWebcams, EarthCam, webcamtaxi** | Commerciali; solo widget ufficiale con pubblicità e cookie |
| **YouTube Live** (solo non primaria) | Pubblicità e tracciamento (anche `youtube-nocookie` usa lo storage). Serve consenso GDPR con facciata click-to-load. Video che spariscono o cambiano id; la ricerca automatica richiede la Data API con key. Al massimo una lista curata a mano, opt-in |

## 14. Migliori candidati GO

1. **Iowa DOT: GO.** Licenza più chiara (CC BY 4.0 sul video URL), catalogo ArcGIS con CORS `*`, circa 650 LIVE.
2. **Caltrans: GO CON LIMITI.** Rete più grande verificata (**1.485 LIVE misurati**), pubblico dominio, stream pubblicati dall'ente per il browser.
3. **VDOT: GO CON LIMITI.** Circa 1.480 LIVE; attribuzione VDOT obbligatoria; conferma scritta consigliata.
4. **MnDOT: GO CON LIMITI.** Circa 1.020 LIVE; nessun termine scritto, conferma necessaria.
5. **Taiwan THB: GO CON LIMITI.** Circa 2.200 LIVE MJPEG, licenza governativa aperta, **nessuna dipendenza**, ma avvio lento.

---

## 15. Architettura teorica LIVE + SNAP (non implementata)

```
CAM
├── LIVE  (badge rosso ● LIVE) — Caltrans + Iowa in v1
└── SNAP  (badge ciano SNAP)   — le 2.629 attuali, invariate
```

1. **Catalogo:**
   - lo stesso formato statico, con la tupla estesa a un campo `kind` (`S`/`L`);
   - `camSources.ts` dichiara per fonte `kind`, host consentiti (con **porta esplicita** per Iowa :8888), template dello stream e **template del poster** (Caltrans `currentImageURL`, Iowa `ImageURL`, Taiwan `/snapshot`);
   - lo script di build **verifica ogni playlist** (come la scansione di questo audit) e scarta gli stream spenti.
2. **CAM Explorer riusato:**
   - filtro/scheda LIVE | SNAP | Tutte;
   - nella lista **solo poster JPEG** (lazy come oggi, al massimo 4 contemporanei), **mai stream**.
3. **CamCard:**
   - per LIVE mostra il poster e un pulsante **▶ Guarda LIVE**;
   - il player (`<video>` nativo, oppure hls.js caricato con `import()` solo lì) parte solo dopo il tap;
   - **nessun autoplay**, né globale né in lista.
4. **Un solo stream LIVE aperto** in tutta l'app: stato globale `activeLiveCam`; aprirne un altro chiude il precedente.
5. **Stop completo:**
   - alla chiusura della CamCard: `video.pause()`, `removeAttribute('src')`, `load()`, `hls.destroy()`; per MJPEG `img.src=''`;
   - con `document.hidden`: stop, e al ritorno un "Riprendi" manuale;
   - **timeout** di 3 minuti con "Continua a guardare".
6. **Errore o stream spento:** "Stream non disponibile", con ripiego sul poster SNAP e link alla fonte; nessun retry automatico.
7. **Sicurezza:** URL costruiti solo da template e host consentiti; solo HTTPS; nessun proxy; nessun iframe.
8. **Attribuzione** per fonte nella card: obbligatoria per Iowa e VDOT.

## 16. Impatto mobile e dati

| Stream | Banda indicativa | 1 minuto | 3 minuti (timeout) |
|---|---|---|---|
| 320×240 HLS (VDOT, parte di Caltrans) | circa 10–15 KB/s | circa 0,6–0,9 MB | circa 2–3 MB |
| 480×270 fMP4 (Iowa, segmenti circa 70–120 KB da 4,4 s) | circa 15–30 KB/s | circa 1–2 MB | circa 3–5 MB |
| 720p (Caltrans 1280×720) | circa 100–250 KB/s | circa 6–15 MB | circa 18–45 MB |
| 1080p / 4 Mbps (MnDOT) | circa 500 KB/s | circa 30 MB | circa 90 MB |
| MJPEG Taiwan | circa 30–65 KB/s | circa 2–4 MB | circa 6–12 MB |

Misure: HLS dalle dimensioni dei segmenti; MJPEG dai byte ricevuti in 30 s.

**Raccomandazioni:**
- avvio solo su tap;
- su mobile, avviso del consumo quando `navigator.connection.saveData` è attivo o la rete è cellulare (dove esposto);
- preferire la variante a risoluzione più bassa quando la playlist ne offre più d'una;
- timeout di 3 minuti.

**iPhone:**
- HLS nativo in `<video playsinline muted>`;
- niente hls.js (iOS non ha MSE sugli iPhone meno recenti, ma HLS nativo sì);
- MJPEG in `<img>` da verificare sul dispositivo.

## 17. hls.js

| Voce | Valore |
|---|---|
| Serve? | **Sì per Chrome desktop, Firefox e (probabilmente) Android.** No per Safari/iOS. Taiwan MJPEG non ne ha bisogno |
| Versione verificata | 1.7.3 (registry npm, 2026-09-28) |
| Licenza | **Apache-2.0**, open source, gratuita |
| Peso `hls.min.js` | 619 KB raw · **188 KB gzip** |
| Peso `hls.light.min.js` | 386 KB raw · **119 KB gzip** (senza sottotitoli, audio alternativi, DRM: sufficiente per queste camere) |
| Integrazione | `import()` dinamico solo alla prima apertura di una camera LIVE, fuori da bundle iniziale e precache |
| Alternative native | `<video>` con HLS nativo (Safari/iOS, e altri browser se `canPlayType('application/vnd.apple.mpegurl')` restituisce un valore non vuoto); MJPEG in `<img>` |
| Alternativa senza dipendenza | LIVE solo dove esiste HLS nativo; altrove "SNAP + apri stream ufficiale" |

**Non installata.**

## 18. Costo

**€0.** Tutte le fonti GO/GO CON LIMITI sono gratuite e senza key. Nessun backend, proxy, Worker, SaaS o carta di credito. Il traffico video va direttamente dal browser dell'utente al server dell'ente, quindi non ci sono costi proporzionali agli utenti. hls.js, se approvata, è open source gratuita.

## 19. Raccomandazione per EarthRadar CAM LIVE v1

### **GO CON LIMITI**

- **Fonti v1:** **Caltrans** (circa 1.485 LIVE verificati) + **Iowa DOT** (circa 650 LIVE, CC BY 4.0), cioè circa **2.100 stream LIVE reali**.
- **Le 2.629 camere attuali restano SNAP**, invariate.
- **Condizioni:**
  1. prova manuale di 10 minuti su iPhone (Safari) e Chrome con 3 URL Caltrans e 3 Iowa, **prima** di qualsiasi implementazione;
  2. decisione su **hls.js** (senza: LIVE solo su Safari/iOS);
  3. verifica di disponibilità degli stream nello script di build;
  4. un solo stream alla volta, avvio su tap, stop alla chiusura, alla pagina nascosta e al timeout;
  5. attribuzioni per fonte.
- **v1.1 (dopo conferma scritta degli enti):** VDOT, MnDOT; Taiwan THB come fonte MJPEG senza dipendenze.
- **Italia/Europa:** nessuna fonte LIVE istituzionale disponibile oggi.

---

*Fonti principali:*
- [Caltrans CCTV dataset](https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm)
- [Caltrans Streaming Video Locations](https://cwwp2.dot.ca.gov/vm/streamlist.htm)
- [Caltrans Conditions of Use](https://dot.ca.gov/conditions-of-use)
- [Iowa DOT Traffic Cameras (ArcGIS item)](https://www.arcgis.com/home/item.html?id=c4063f200a7b4da5826e2ac86c677cf5)
- [Iowa DOT Terms of Use](https://iowadot.gov/policies-statements/terms-use)
- [VDOT guidelines (FHWA)](https://ops.fhwa.dot.gov/travelinfo/resources/datashare/app2vdot.htm)
- [511NY Terms](https://511ny.org/terms)
- [Taiwan THB CCTV open data](https://cctv-maintain.thb.gov.tw/opendataCCTVs.xml)
- [Taiwan Open Government Data License](https://data.gov.tw/license)
- [HKeMobility Traffic Webcast](https://www.hkemobility.gov.hk/en/traffic-information/live/webcast)
- [hls.js (npm)](https://www.npmjs.com/package/hls.js)
