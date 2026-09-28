# CAM-LIVE-EUROPE-AUDIT-R1 — Webcam video LIVE in Italia ed Europa

**Data:** 2026-09-28 (prove fra 19:40 e 22:30 UTC, da IP italiano)
**Natura:** solo audit tecnico/legale. Nessun file di EarthRadar modificato, `cams-v2.json` invariato, nessuna dipendenza installata, nessun commit né push.
**Metodo:**
- Richieste HTTP reali con `Origin: https://www.alessandropezzali.it` e senza Referer.
- Nessun header falsificato, nessuna protezione aggirata, nessuna credenziale di terzi usata.
- Video mai archiviato: solo manifest, letture parziali di segmenti e catture MJPEG in memoria.
- Le fonti decisive (INGV/GARR.tv, CNR-ISMAR, divieto VVC) sono state **verificate due volte**, dagli analisti e da me in modo indipendente.

**Classi:**
- **LIVE DIRECT:** stream video (HLS, MJPEG, fMP4) riproducibile direttamente dalla PWA.
- **LIVE YOUTUBE:** video live disponibile solo come embed YouTube.
- **LIVE PROXY REQUIRED:** video live accessibile solo con Referer, token o credenziali altrui.
- **SNAP:** immagini periodiche o clip registrate.
- **NO-GO:** vietato o inutilizzabile.

---

## 1. Executive summary

**Sì: esiste almeno una vera CAM LIVE europea integrabile legalmente in EarthRadar a costo €0 e senza proxy. È in Italia.**

| Fonte | Paese | Stream | Protocollo | Licenza | Verdetto |
|---|---|---|---|---|---|
| **INGV – Osservatorio Etneo: "Etna" ed "Eolie"** su GARR.tv | IT | 2 | HLS diretto, 360p/720p/1080p | **CC BY 4.0** (DOI 10.13127/etna/tvchn e aeolian) | **GO CON LIMITI** |
| **CNR-ISMAR: Piattaforma Acqua Alta (3) + Riva Sette Martiri, Venezia** su GARR.tv | IT | 4 | HLS diretto, 360p/720p | CC BY 4.0 | **GO CON LIMITI** (instabili) |

**Il resto dell'Europa (32 paesi analizzati, circa 110 fonti):**
- **Nessuna rete stradale nazionale** offre video live riutilizzabile. Tutte pubblicano immagini (SNAP), clip MP4 o niente.
  - **Belgio (Verkeerscentrum Vlaanderen):** ha video live veri, ma le condizioni li **vietano esplicitamente** fuori dal proprio sito. **NO-GO.**
  - **Germania (Autobahn GmbH):** l'API ha CORS `*` ma **0 webcam** su tutte le 111 strade.
  - **Danimarca:** webcam **rimosse** dal sito ufficiale.
  - **Spagna (DGT):** 1.952 camere, **tutte JPEG**; nessun campo video nel DATEX II.
- Altri live tecnici esistono (Port of Amsterdam, Smart Burgas, Słupsk, Townet/Cagli, ipcamlive, Attiki Odos, HLS privati polacchi e olandesi), ma **senza licenza**, con token o credenziali altrui, o di privati. Sono **DA VERIFICARE** o **NO-GO**.
- **YouTube istituzionale:** circa 15 canali di enti pubblici con live 24/7 embeddabile, in circa 10 paesi (Rotterdam, Dublin Port, Helsinki, Rovaniemi, Kirkenes, Rees, Naumburg, Sint-Niklaas, Zwin, Dorset, Oxford, Vaticano; RÚV Islanda solo durante le eruzioni). **GO CON LIMITI solo dietro una facciata di consenso** (tracciamento Google, possibile pubblicità, ID instabili). Non è LIVE DIRECT.

**Copertura geografica:**
- **LIVE DIRECT:** oggi solo **1 paese (Italia), 2 aree** (Sicilia orientale/Eolie e Venezia), **2–6 stream**.
- **Con YouTube istituzionale:** circa 10–11 paesi.

---

## 2. Italia — ricerca completa

### 2.1 LIVE DIRECT verificati

**INGV-OE su GARR.tv (Etna ed Eolie)**

| Campo | Valore |
|---|---|
| SOURCE | GARR.tv (PeerTube del Consortium GARR, rete Istruzione e Ricerca), canale "INGV Catania". Pagine ufficiali: `ct.ingv.it/sezioniesterne/StreamingEtna.php`, `StreamingEolie.php` |
| PAESE / ENTE | Italia / INGV – Osservatorio Etneo (ente pubblico di ricerca) |
| TIPO CONTENUTO | video di sorveglianza vulcanica (Etna; arcipelago eoliano) |
| CAM / LIVE REALI | 2 / **2** |
| PROTOCOLLO | HLS (MPEG-TS H.264 + AAC), segmenti da 4 s, `#EXT-X-PROGRAM-DATE-TIME` reale |
| RISOLUZIONE | 640×360, 1280×720, 1920×1080 (adattiva) |
| URL | `https://garr.tv/static/streaming-playlists/hls/c6c70a03-e711-4eed-9835-1d02f5a5ec58/master.m3u8` (Etna) · `…/8790a7a8-211c-4794-bcb2-41e24cd2e322/master.m3u8` (Eolie) |
| HTTPS / CORS | SÌ / `Access-Control-Allow-Origin: *` su master e segmenti (osservato) |
| TOKEN / COOKIE / REFERER | nessuno / nessuno / non richiesto |
| SCADENZA URL | nessuna: UUID stabile e usato da INGV stesso nel proprio iframe. Alle ripartenze la sessione riparte da 0 |
| STATO SENZA CHIAVE | `GET https://garr.tv/api/v1/videos/<uuid>` (CORS `*`) → `isLive`, `licence` |
| BROWSER DIRECT | SÌ: `<video>` nativo su Safari/iOS, hls.js (già in EarthRadar) su Chrome e Android |
| COSTO | €0 |
| LICENZA | **CC BY 4.0**, dichiarata sulla pagina INGV e nel campo `licence` dell'API GARR.tv |
| ATTRIBUTION | "Pecora E., Prestifilippo M., et al. (2025). Etna's TV channel (EtnaTVChn). INGV. doi:10.13127/etna/tvchn — CC BY 4.0" (Eolie: doi:10.13127/aeolian/tvchn) |
| EMBED CONSENTITO | Sì: la CC BY permette riproduzione e ridistribuzione. Le condizioni GARR.tv: "nulla nel presente Accordo è concepito per impedirti di riutilizzare i contenuti disponibili con una licenza Creative Commons secondo i termini e le condizioni della licenza applicabile" |
| EARTHRADAR COMPATIBLE | **SÌ** |
| CLASSE | **LIVE DIRECT** |
| **VERDETTO** | **GO CON LIMITI:** attribuzione con DOI, avvio solo su tap (già così), qualità limitata alla dimensione del player, comunicazione di cortesia a INGV/GARR |

**Prove reali, 25 s ciascuna:**

| Stream | Prova indipendente (mia) | Prova analista | Risposte |
|---|---|---|---|
| Etna | `MEDIA-SEQUENCE` 2385→2391; `PROGRAM-DATE-TIME` 20:05:20→20:05:44 UTC | 2269→2276; 2319→2326 | master 200 `application/vnd.apple.mpegurl` ACAO `*`; segmento 206 `video/mp2t` ACAO `*` |
| Eolie | 1053→1059; 20:05:45→20:06:09 UTC | 938→944 | come sopra |

**CNR-ISMAR su GARR.tv**

| Campo | Valore |
|---|---|
| ENTE | CNR – Istituto di Scienze Marine (ente pubblico); canali "AAOT - CNR-ISMAR - Channel 1–4" |
| CONTENUTO | Piattaforma oceanografica Acqua Alta (Ovest, Sud, subacquea −6 m) e Riva Sette Martiri (Venezia) |
| CAM / LIVE | 4 / 4 pubblicati come live |
| PROTOCOLLO / RISOLUZIONE | HLS, 640×360 (fino a 720p su alcuni) |
| HTTPS / CORS / TOKEN | SÌ / `*` / nessuno |
| LICENZA | CC BY 4.0 (campo API); caricati dall'account di un ricercatore sui canali ISMAR |
| **Stabilità** | **Bassa.** Nella mia prova solo 1/4 avanzava (Riva Sette Martiri 70→76); gli altri 3 erano fermi (sequenza 0→0 o 74→74). Riavvii frequenti (ogni 10–15 min secondo l'analista) |
| CLASSE / **VERDETTO** | LIVE DIRECT · **GO CON LIMITI:** servono controllo dello stato (`isLive`) e gestione "OFFLINE"; licenza da confermare con una nota a CNR-ISMAR |

Sull'istanza, al momento della prova, risultano **6 live in totale**, tutti "Public" e CC BY 4.0: 2 INGV + 4 ISMAR (`GET /api/v1/videos?isLive=true`).

### 2.2 Altre fonti italiane

| Fonte | Cosa pubblica | Classe | Verdetto |
|---|---|---|---|
| Autostrade per l'Italia | oltre 4.000 camere; `video.autostrade.it/video-mp4_hq/...mp4` = **clip da circa 1 MB sovrascritte ogni circa 2 min**; nessun CORS; nessuna licenza (termini "tutti i diritti riservati") | SNAP (clip) | NO-GO |
| ANAS (VAI) | circa 200 camere, immagini dentro app e sito; nessuno stream né licenza | SNAP | DA VERIFICARE |
| A22 Autobrennero | 13 JPEG `autobrennero.it/WebCamImg/kmNNN.jpg`, circa 1/min | SNAP | DA VERIFICARE (nessuna licenza sulle immagini) |
| SATAP / ASTM (A4, Fiori, SALT, Asti-Cuneo, Autovia Padana, SAV) | circa 51 clip MP4 da 15 s | SNAP (clip) | DA VERIFICARE |
| Autostrade Alto Adriatico | JPEG con cookie di sessione | SNAP | NO-GO |
| Open Data Hub Südtirol (WebcamInfo, 1.963 voci) | quasi tutto JPEG o pagine player feratel/panomax; clip MP4 panocloud; CC0 su 278 voci ma riferito ai metadati | SNAP | GO CON LIMITI solo SNAP (voci LTS/IDM CC0) |
| ipcamlive (voce LTS "webcamadrenalina") | HLS live (31442→31454), CORS `*`, server e id variabili; Content-Type errato | LIVE DIRECT tecnico | DA VERIFICARE (permesso del titolare) |
| Townet srl (Comune di Cagli) | HLS 1080p live (419480→419492), CORS `*`; "© Townet srl, all rights reserved" | LIVE DIRECT tecnico | DA VERIFICARE (permesso scritto) |
| ARPAE Emilia-Romagna "camERa" | 8 camere costiere, API CORS `*`, prodotti TIMEX/SNAPSHOT ogni 15 min | SNAP | DA VERIFICARE |
| ARPAV, ARPA FVG/OSMER, ARPA Piemonte | immagini (alcune HTTP) | SNAP | DA VERIFICARE |
| INGV pagine immagini (ct.ingv.it, cme.ingv.it) | JPEG circa ogni 10 min, CC BY 4.0 | SNAP | GO CON LIMITI (SNAP) |
| INGV-OV (Vesuvio, Campi Flegrei) | pagina webcam "Sito in costruzione" | — | non disponibile oggi |
| Comune di Venezia – Centro Maree | 5 JPEG circa ogni 20 min | SNAP | DA VERIFICARE |
| Comuni con SkylineWebcams (Verona, Ferrara, Pisa) | widget commerciale | LIVE PROXY/widget | NO-GO diretto |
| Autorità di Sistema Portuale (Genova, Savona, Trieste, Venezia, Livorno, Napoli, Palermo, Ancona) | nessuno stream ufficiale; Savona = MP4 preregistrato | — | NO-GO |
| Aeroporti (SEA, ADR, SAVE), Capitanerie, Protezione Civile | nessun feed pubblico trovato | — | NO-GO |
| YouTube istituzionale IT | INGV non trasmette le camere su YouTube (usa GARR.tv); canali comunali solo per eventi e consigli | — | nessun candidato |

**Non verificato in Italia:**
- portali smart-city di Milano, Roma, Torino, Bologna, Napoli, Genova;
- camere stradali regionali di Lombardia, Toscana, Liguria, Piemonte, Valle d'Aosta, Sardegna e Sicilia;
- la frequenza di messa in onda INGV/ISMAR nell'arco di 24 ore.

---

## 3. Europa — paese per paese

| Paese | Fonti principali analizzate | LIVE reale? | LIVE DIRECT utilizzabile? | Note |
|---|---|---|---|---|
| **Francia** | APRR/AREA (124, clip Viewsurf ogni circa 10 min), ATMB/Tunnel Monte Bianco (clip, Cloudflare), Grand Lyon Criter (15 JPEG, Licence Ouverte v2), Loire-Atlantique (5 JPEG), Anglet/Viewsurf (player commerciale), Bison Futé/DIR (immagini) | sì (Viewsurf, commerciale) | **no** | Lyon e Loire-Atlantique: buone SNAP |
| **Spagna** | **DGT DATEX II** (1.952, **solo JPEG**, 0 campi video), Euskadi (489 JPEG, 70 HTTP), Madrid Informo (357 JPEG), SCT Catalunya (JPEG via HTTP), Puerto de Cartagena (non trovato) | no | **no** | DGT: "cámaras en directo" = immagini |
| **Portogallo** | Infraestruturas de Portugal (nessun layer camere attuale), Brisa/Via Verde (JS privato), APDL, IPMA | non verificato | **no** | DA VERIFICARE |
| **Belgio** | **Verkeerscentrum Vlaanderen** (72 player live; divieto esplicito), Wallonia trafiroutes (215 JPEG), Brussels Mobility; YouTube: Zwin Natuurpark, Municipio di Sint-Niklaas | sì (VVC, vietato) | **no** | vedi sotto |
| **Paesi Bassi** | Rijkswaterstaat (solo con Referer forzato → NO-GO), **Port of Amsterdam** (HLS 720p reale, token Wowza da 30 min, nessuna licenza); YouTube: **Port of Rotterdam** ×2 | sì | **no** (Amsterdam DA VERIFICARE) | |
| **Regno Unito** | TfL (JPEG + clip da 10 s), National Highways (licenza a richiesta), Traffic Scotland ("still images"), TrafficwatchNI (JPEG); YouTube: Dorset Council, Oxford Martin School | no (diretti) | **no** | |
| **Irlanda** | TII (184, probabilmente immagini), Dublin City Council (404); YouTube: **Dublin Port** ×3 | solo YouTube | **no** | |
| **Germania** | Autobahn GmbH (**0 webcam**), Hamburg VLZ (18, dataset senza URL media), Hafen Hamburg (JPEG), verkehr.nrw (immagini); YouTube: Stadt Rees, Stadt Naumburg | solo YouTube | **no** | |
| **Austria** | ASFINAG (solo credenziali estratte → NO-GO), Länder non esplorati a fondo | no | **no** | |
| **Svizzera** | MeteoSwiss (circa 35, panorama ogni 10 min, OGD), ASTRA/cantoni/SBB (nessun video); roundshot/foto-webcam privati | no | **no** | |
| **Danimarca** | Vejdirektoratet: **webcam rimosse** (FAQ ufficiale) | no | **no** | |
| **Svezia** | Trafikverket (JPEG, key obbligatoria) | no | **no** | |
| **Norvegia** | Statens vegvesen (JPEG, DATEX con credenziali); YouTube: Comune di Sør-Varanger | solo YouTube | **no** | |
| **Finlandia** | Digitraffic (810 stazioni JPEG, CC BY 4.0: **già in EarthRadar SNAP**); YouTube: **Port of Helsinki**, Città di Rovaniemi | solo YouTube | **no** | |
| **Islanda** | Vegagerðin (JPEG); YouTube: **RÚV** (vulcano Sundhnúkur/Grindavík, live solo durante eventi) | solo YouTube | **no** | |
| **Polonia** | GDDKiA (JPEG), TRISTAR Tricity (portale), **Słupsk** (2 MJPEG comunali, nessuna licenza), nadmorski24/tkchopin (71 HLS privati) | sì | **no** (Słupsk DA VERIFICARE) | |
| **Rep. Ceca** | ŘSD (JPEG, **non open data** per dichiarazione di data.gov.cz) | no | **no** | |
| **Slovacchia, Romania, Croazia, Lettonia, Estonia** | NDS, CNAIR, HAK, LVC, Tark Tee: immagini o portali SPA | no | **no** | licenze non lette |
| **Slovenia** | DARS/promet.si (JPEG ogni 5 min, "not live video") | no | **no** | |
| **Grecia** | Attiki Odos / Nea Odos (6 HLS via ipcamlive con `apisecret` nel JS) | sì | **no** (credenziale altrui) | NO-GO |
| **Bulgaria** | **Smart Burgas** (Comune; 18 playlist HLS, alcune live, nessuna licenza); api.bg non raggiungibile | sì | **no** (DA VERIFICARE) | |
| **Serbia / Macedonia del Nord** | AMSS (associazione, HLS), Neotel (telco privata, HLS ai valichi) | sì | **no** | privati |
| **Lituania** | Via Lietuva eismoinfo ("fotocamere", JPEG); Vilnius (non raggiungibile) | no | **no** | |
| **Vaticano** | YouTube Vatican News (Piazza San Pietro) | solo YouTube | **no** | |

### 3.1 Belgio — verifica specifica (Verkeerscentrum Vlaanderen)

| Campo | Valore |
|---|---|
| Camere | 72 in `/camerabeelden`, ognuna con un player live `players.media.verkeerscentrum.be?name=WEB_<id>` |
| Video reali | probabilmente tutte e 72 (player live); protocollo non osservabile perché bloccato |
| Accesso | snapshot `*.stream.jpg` → **403 senza Referer VVC**; player senza Referer → "**Content embedding is niet toegelaten op deze site.**" |
| Condizioni (verificate da me) | "De live camerabeelden die aangeboden worden op www.verkeerscentrum.be zijn **uitsluitend bedoeld voor raadpleging op de website van het Verkeerscentrum zelf**. Ze mogen **op geen enkele manier hergebruikt of verspreid** worden via andere kanalen." Framing e inline linking richiedono **autorizzazione scritta preventiva** |
| **Verdetto** | **NO-GO.** Nessun aggiramento tentato. Unica via: richiesta formale di licenza |

### 3.2 Spagna — verifica specifica (DGT)

| Campo | Valore |
|---|---|
| Dataset | NAP DGT `camaras_datex2_v37.xml` (3,7 MB) |
| Record | **1.952**, tutti `typeOfDevice=camera` |
| Media | `deviceUrl = https://etraffic.dgt.es/camarasEtraffic/<id>.jpg`, JPEG via Akamai, `max-age=120` |
| Video | **0** campi video, stream, m3u8 o rtsp. Il JS di etraffic crea solo `<img>` |
| Licenza | NAP "Licence and Free of charge" (schema.org → CC BY); avviso legale del portale generico |
| **Verdetto** | **SNAP** (GO CON LIMITI con attribuzione DGT); **nessun motion video** |

---

## 4. Fonti LIVE DIRECT

| Fonte | Paese | Stream | Licenza chiara? | Verdetto |
|---|---|---|---|---|
| **INGV-OE Etna / Eolie (GARR.tv)** | IT | 2 | **Sì, CC BY 4.0 + DOI** | **GO CON LIMITI** |
| **CNR-ISMAR Acqua Alta / Venezia (GARR.tv)** | IT | 4 (instabili) | CC BY 4.0 (da confermare con l'ente) | **GO CON LIMITI** |
| Townet (Comune di Cagli) | IT | 1+ | no ("all rights reserved") | DA VERIFICARE |
| ipcamlive ("webcamadrenalina", ODH) | IT | 1 | no | DA VERIFICARE |
| Smart Burgas | BG | fino a 18 (alcuni fermi) | no | DA VERIFICARE |
| Słupsk (MJPEG comunale) | PL | 2 | no | DA VERIFICARE |
| AMSS / Neotel | RS / MK | 1 / 2 | no (privati) | NO-GO / DA VERIFICARE |
| HLS privati nadmorski24 (PL), streamlock (NL) | PL / NL | 71 / 8 | no (privati, finanziati dalla pubblicità) | NO-GO |

## 5. Fonti LIVE YOUTUBE (non LIVE DIRECT)

Verificati `isLiveNow:true` e `playableInEmbed:true` dagli analisti il 2026-09-28. La natura istituzionale è dedotta dal canale, non certificata.

| Canale | Ente | Paese | Video ID |
|---|---|---|---|
| Port of Rotterdam | Autorità portuale | NL | `_KVWehizoNU`, `M09NaBVPjAI` |
| Dublin Port Company | Società statale | IE | `jy3fkOBIolk`, `oxx7MqjhOpw`, `K_ye7QHXosQ` |
| Port of Helsinki | Porto municipale | FI | `6hPWq2IG08M` |
| City of Rovaniemi | Comune | FI | `Cp4RRAEgpeU` |
| Sør-Varanger kommune | Comune (Kirkenes) | NO | `acJRSLCe6G0` |
| Stadt Rees / Stadt Naumburg | Comuni | DE | `SeN3fw3R6-E` / `r-aFbbMHnhI` |
| Zwin Natuurpark / Stadhuis Sint-Niklaas | Provincia / Comune | BE | `vtpms6arKBk` / `7gOLLJGudNo` |
| Dorset Council / Oxford Martin School | Ente locale / università | UK | `HikXPCyNcFg` / `h8glPXsnezU` |
| Vatican News | Santa Sede | VA | `EEM7a3mHMR4` |
| RÚV | Servizio pubblico | IS | `kXD4A9uFHcg` (solo durante le eruzioni) |

**Valutazione per EarthRadar:**

| Aspetto | Valutazione |
|---|---|
| Chiave API | **nessuna** per l'embed; la ricerca automatica degli ID richiede la Data API (esclusa). Serve una lista curata a mano |
| Stabilità ID | gli ID cambiano quando lo stream riparte (es. Naumburg 08-2026). La forma `embed/live_stream?channel=` non è documentata |
| Privacy | anche `youtube-nocookie.com` scrive storage/cookie alla riproduzione. **Serve consenso GDPR**: facciata click-to-load più aggiornamento dell'informativa |
| Pubblicità | non escludibile |
| Autoplay | vietato prima del consenso (già coerente con EarthRadar) |
| Dipendenza | totale da YouTube/Google |

**Verdetto: GO CON LIMITI solo con facciata di consenso**, in una categoria distinta (non "LIVE DIRECT"). Decisione di prodotto e privacy tua.

## 6. Fonti LIVE PROXY REQUIRED

| Fonte | Paese | Perché |
|---|---|---|
| Rijkswaterstaat (via OSIRIS) | NL | embed **401** senza Referer; OSIRIS forza il Referer |
| Port of Amsterdam (netcamviewer) | NL | HLS con **token Wowza** da 30 min, ottenibile solo dalla pagina |
| Attiki Odos / Nea Odos (ipcamlive) | GR | `apisecret` dell'operatore nel JS pubblico |
| ASFINAG | AT | Basic Auth estratta dal widget (OSIRIS) |
| SkylineWebcams (comuni IT, siti EU) | IT/EU | CDN con protezione hotlink, widget commerciale |
| Verkeerscentrum Vlaanderen | BE | Referer obbligatorio **e** divieto contrattuale |

→ **Tutti NO-GO** (o DA VERIFICARE solo con permesso scritto). Mai aggirati.

## 7. Fonti SNAP (non LIVE)

Buone fonti SNAP legalmente pulite:
- **Digitraffic** (FI, CC BY 4.0: già in EarthRadar);
- **Grand Lyon Criter** (FR, Licence Ouverte v2, 15);
- **Loire-Atlantique** (FR, 5);
- **DGT** (ES, 1.952);
- **Madrid Informo** (ES, 357);
- **Euskadi** (ES, circa 420 HTTPS);
- **MeteoSwiss** (CH, circa 35, OGD da confermare);
- **INGV immagini** (IT, CC BY 4.0).

Utili per un'eventuale espansione SNAP, **fuori dallo scopo** di questo audit.

## 8. Fonti NO-GO

| Fonte | Motivo |
|---|---|
| **Verkeerscentrum Vlaanderen (BE)** | Divieto esplicito di riuso ed embedding |
| **Autostrade per l'Italia** | Clip, nessuna licenza |
| **Autobahn GmbH (DE)** | 0 camere |
| **Vejdirektoratet (DK)** | Camere rimosse |
| **Trafikverket (SE)** | Key obbligatoria |
| **Statens vegvesen DATEX (NO)** | Credenziali e IP fisso |
| **ŘSD (CZ)** | Dati dichiarati non open |
| **ASFINAG (AT), Attiki/Nea Odos (GR)** | Credenziali altrui |
| **Rijkswaterstaat (NL)** | Referer forzato |
| **SkylineWebcams, Windy, EarthCam** | Commerciali |
| **HLS privati polacchi e olandesi** | Privati, ad-supported, senza licenza |
| **SCT Catalunya** | Immagini solo HTTP (mixed content) |
| **Porti/aeroporti italiani** | Nessuno stream ufficiale |

## 9. Analisi dei connector europei OSIRIS

OSIRIS (MIT) è stato usato **solo come indice**. **Nessun connector europeo di OSIRIS offre video live di un ente pubblico con licenza chiara.**

| Connector OSIRIS | Fonte originale | Tipo | Accesso OSIRIS | N. EU | EarthRadar diretto? | Verdetto |
|---|---|---|---|---|---|---|
| `poland.ts` | nadmorski24.pl (`ls.tkchopin.pl`, Wowza) | HLS | URL diretto | 71 | tecnicamente sì | **NO-GO** (privato) |
| `poland.ts` | Słupsk (`slupsk.pl/kamera1-2`) | MJPEG | diretto | 1 (esistono 2) | sì | DA VERIFICARE |
| `bulgaria.ts` | Smart Burgas (`pics.smartburgas.eu`) | HLS | diretto | 1 (18 disponibili) | sì | DA VERIFICARE |
| `serbia.ts` | AMSS | HLS | diretto | 1 | sì (Cloudflare sul sito) | DA VERIFICARE |
| `macedonia.ts` | Neotel (telco) | HLS | diretto | 2 | sì | NO-GO / DA VERIFICARE |
| `greece.ts` | Attiki Odos (ipcamlive) | iframe | player di terzi | 2 | solo iframe | NO-GO |
| `netherlands.ts` | Rijkswaterstaat → inmoves | JPEG / player | **proxy con Referer forzato** | 26 | no (401) | NO-GO |
| `public-webcams.generated.ts` | bekijkhet.nu (streamlock, ipcamlive, rtsp.me, link) | HLS 8 / iframe 3 / link 205 + circa 164 YouTube | diretto / scraping ID YouTube | circa 262 | tecnicamente | NO-GO (privati) |
| `world-skyline`, `italy.ts`, `switzerland.ts`, parte di `spain.ts` | SkylineWebcams | JPEG + link | **proxy** (hotlink) | circa 190 | tecnicamente | NO-GO |
| `spain.ts` | DGT etraffic | JPEG | proxy | 1.921 | sì (200 diretto) | SNAP |
| `spain/france/czechia/germany/slovakia.ts` | YouTube ID incollati a mano | YouTube | — | circa 14 | — | NO-GO (canali non istituzionali) |
| `france.ts` | APRR | link | link esterno | 28 | no | NO-GO |
| `asfinag.ts` | ASFINAG | JPEG | **Referer/Origin falsificati + Basic Auth estratta** | dinamico | no | NO-GO |
| `lithuania.ts` | eismoinfo | JPEG | proxy | dinamico | sì (CORS `*`) | SNAP |
| `finland.ts` | Digitraffic | JPEG | diretto | 810 | sì | SNAP (già in EarthRadar) |
| `iceland.ts` | Vegagerðin | JPEG | diretto | dinamico | — | SNAP |
| `route.ts` | TfL | JPEG + clip | diretto | 890 | sì | SNAP (già in EarthRadar) |

**Nota:** INGV/GARR.tv **non è presente in OSIRIS**. È emerso dalla ricerca diretta sulle fonti italiane.

## 10. Licenze e condizioni

| Fonte | Licenza | Embed/riuso | Attribuzione |
|---|---|---|---|
| INGV-OE Etna/Eolie | **CC BY 4.0** (pagina INGV + API) | consentito dalla licenza; le condizioni GARR.tv confermano il riuso CC | citazione con DOI 10.13127/etna/tvchn · 10.13127/aeolian/tvchn |
| CNR-ISMAR | CC BY 4.0 (API) | consentito; conferma dell'ente consigliata | "CNR-ISMAR, CC BY 4.0, via GARR.tv" |
| GARR.tv (piattaforma) | Condizioni d'uso + AUP GARR; il codice di condotta riserva **l'uso dell'istanza** (pubblicazione) alla comunità di istruzione e ricerca | la fruizione pubblica di contenuti CC è ammessa | "via GARR.tv" |
| Verkeerscentrum | condizioni proprietarie | **vietato** | — |
| YouTube istituzionale | Termini YouTube (embed abilitato dal titolare) | solo player ufficiale | nome del canale |
| Tutte le fonti DA VERIFICARE | nessuna licenza pubblicata | servono permessi scritti | — |

**Precisazione legale:** CC BY 4.0 richiede attribuzione, link alla licenza e indicazione di eventuali modifiche. EarthRadar non modifica il video.

## 11. Compatibilità browser

| Fonte | Safari/iOS | Chrome desktop | Android |
|---|---|---|---|
| INGV / ISMAR (HLS TS H.264 + AAC) | `<video>` nativo | hls.js (già presente, caricato solo al tap) | hls.js o nativo |
| MJPEG (Słupsk) | `<img>` | `<img>` | `<img>` |
| YouTube | iframe | iframe | iframe |

**Riproduzione in un browser reale non effettuata in questo audit** (solo verifiche HTTP). Gli stream GARR hanno una traccia audio: EarthRadar avvia già il video in muto.

## 12. Stream realmente testati

| Tipo di prova | Numero |
|---|---|
| HLS con avanzamento di sequenza (20–30 s) | **circa 25**: INGV 2 (×3 prove), ISMAR 4 (×2), Smart Burgas 3, AMSS 1, Neotel 2, Port of Amsterdam 1, Townet 1, ipcamlive 1, streamlock NL 2, tkchopin 1 (fallito), Wowza PL di riferimento |
| Di cui con avanzamento confermato | circa 18 |
| MJPEG (fotogrammi distinti) | Słupsk 2 (analista) |
| Canali YouTube controllati (`isLiveNow`, `playableInEmbed`) | circa 25 |
| Cataloghi e API interrogati | circa 60 (DATEX DGT, Autobahn ×111 strade, Euskadi, Madrid, Lyon, ODH, TfL, Digitraffic, ecc.) |

## 13. Copertura geografica ottenibile

| Scenario | Paesi europei | Stream LIVE |
|---|---|---|
| **LIVE DIRECT con licenza chiara (oggi)** | **1 (Italia)**: Etna/Eolie (Sicilia) + Venezia/Adriatico | **2 stabili + 4 instabili** |
| + fonti DA VERIFICARE, se si ottengono i permessi | + BG, PL, NL, e altre località IT | + circa 25 |
| + YouTube istituzionale (con consenso) | circa 10–11 (NL, IE, FI, NO, DE, BE, UK, VA, IS, IT…) | + circa 15 |

**Lettura onesta:** l'obiettivo "300 LIVE in 5 paesi" **non è raggiungibile oggi** con LIVE DIRECT legale in Europa. Le reti stradali europee pubblicano immagini o vietano il riuso del video. La distribuzione geografica richiede YouTube istituzionale (con consenso) oppure permessi scritti.

## 14. Migliori candidati per EarthRadar

1. **INGV-OE Etna ed Eolie (IT):** 2 stream HLS diretti, fino a 1080p, CC BY 4.0 con DOI. **GO CON LIMITI.** Valore divulgativo altissimo (vulcani attivi) e stessa architettura di CAM LIVE v1.
2. **CNR-ISMAR Acqua Alta e Venezia (IT):** 4 stream HLS, CC BY 4.0. **GO CON LIMITI** (instabili).
3. **Port of Rotterdam + Dublin Port (NL, IE, YouTube):** 5 stream 24/7 di autorità portuali. **LIVE YOUTUBE, GO CON LIMITI** con facciata di consenso.
4. **Port of Helsinki + Rovaniemi + Sør-Varanger (FI, NO, YouTube):** 3 stream. **LIVE YOUTUBE, GO CON LIMITI.**
5. **Smart Burgas (BG) e Słupsk (PL):** HLS e MJPEG comunali diretti. **DA VERIFICARE:** chiedere il permesso scritto ai Comuni.

## 15. Raccomandazione per CAM LIVE Europe v2

**GO CON LIMITI, in due passi distinti:**

1. **v2a — LIVE DIRECT Italia (subito, nessuna nuova dipendenza).**
   - Nuova fonte `ingv` (e opzionalmente `cnr-ismar`) nel registro CAM:
     - host `garr.tv` in allowlist;
     - riferimento stream = UUID GARR (pattern UUID);
     - poster = immagine CC BY di INGV o thumbnail PeerTube.
   - Prima di mostrare "Diretta disponibile", controllo di stato senza chiave via `GET garr.tv/api/v1/videos/<uuid>` (`isLive`); se non in onda, "OFFLINE".
   - hls.js già presente; qualità limitata alla dimensione del player (`capLevelToPlayerSize`), per non scaricare 1080p in una card da 360 px.
   - Attribuzione con DOI nella card.
   - Una comunicazione di cortesia a INGV-OE e GARR (non obbligatoria per la CC BY, ma consigliata per la banda).
2. **v2b — YouTube istituzionale (solo se lo decidi tu).**
   - Categoria separata **"LIVE · YouTube"**, mai confusa con LIVE DIRECT.
   - Facciata click-to-load con consenso e aggiornamento dell'informativa privacy.
   - Lista curata a mano con verifica periodica degli ID, nessuna API.
3. **Permessi scritti (in parallelo, costo €0):** Verkeerscentrum Vlaanderen, Port of Amsterdam, Comune di Burgas, Comune di Słupsk, Townet/Comune di Cagli, ASTM/SATAP, A22. Solo con autorizzazione esplicita diventerebbero GO.

**Non raccomandato:** proxy, estrazione di token o credenziali, HLS privati senza licenza, SkylineWebcams.

---

*Fonti principali:*
- [INGV-OE Streaming Etna](https://www.ct.ingv.it/sezioniesterne/StreamingEtna.php)
- [GARR.tv](https://garr.tv/)
- [GARR — Etna live](https://www.garr.it/en/news-events/1945-etna-s-eruption-live-on-garr-tv)
- [CNR-ISMAR Acqua Alta](https://www.ismar.cnr.it/web-content/piattaforma-acqua-alta/)
- [Verkeerscentrum — algemene voorwaarden](https://www.verkeerscentrum.be/algemene-voorwaarden)
- [NAP DGT cámaras](https://nap.dgt.es/dataset/camaras-dgt-datex2-v3-7)
- [Vejdirektoratet FAQ webkameraer](https://www.vejdirektoratet.dk/faq-svar/hvorfor-kan-jeg-ikke-laengere-se-webkameraer-paa-trafikinfodk)
- [data.gov.cz — dati camere](https://data.gov.cz/%C4%8Dl%C3%A1nky/vyu%C5%BEit%C3%AD-dat-z-dopravn%C3%ADch-kamer)
- [Grand Lyon Criter](https://data.grandlyon.com/portail/fr/jeux-de-donnees/cameras-web-criter-metropole-lyon/info)
- [Port of Amsterdam webcam](https://www.portofamsterdam.com/en/discover/experience-port/webcam-amsterdam)
- [Dublin Port webcam](https://www.dublinport.ie/webcam/)
- [RÚV live](https://www.ruv.is/english/2025-07-16-ruv-live-stream-from-sundhnuksgigar-448721)
