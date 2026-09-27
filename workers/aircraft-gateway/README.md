# EarthRadar — aircraft gateway

Cloudflare Worker (piano **Free**, nessun binding a pagamento) che fa da gateway tra la PWA
EarthRadar e il provider ADS-B **ADSB.lol**.

```
EarthRadar PWA ──► https://aircraft.alessandropezzali.it (Worker su Custom Domain)
                     │  CORS · validazione · quantizzazione
                     ├─ L1 memoria isolate + coalescing
                     ├─ L2 Cache API del data center (fotografie, lock, breaker condivisi)
                     └─ throttle · breaker ──► api.adsb.lol /v2/point  (≤ 1 chiamata / 30 s per area)
```

Perché serve: ADSB.lol non invia header CORS, quindi il browser non può chiamarlo
direttamente. Il Worker non contiene secret (ADSB.lol oggi non richiede chiavi).

**ADSB.lol è una risorsa gratuita da proteggere**: il gateway è progettato per minimizzare le
chiamate upstream, anche a costo di dati un po' meno recenti.

## Endpoint

| Metodo  | Path                        | Descrizione                                                                                       |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| GET     | `/v1/health`                | Stato del gateway (per isolate): breaker, ultima chiamata upstream, cache. Non chiama l'upstream. |
| GET     | `/v1/aircraft?lat=&lon=&r=` | Aerei entro `r` miglia nautiche da (`lat`, `lon`).                                                |
| OPTIONS | `*`                         | Preflight CORS.                                                                                   |

Parametri di `/v1/aircraft` (validazione rigorosa, altrimenti **400 `invalid_params`**):

- `lat`: decimale in [-90, 90], max 8 decimali, niente notazione esponenziale;
- `lon`: decimale in [-180, 180];
- `r`: **intero** in [1, 150]. **150 NM è il massimo assoluto** di EarthRadar: `r` > 150 → 400
  (mai ridotto in silenzio). ADSB.lol documenta 250 NM ma non lo impone, e un raggio decimale
  produce una risposta non JSON: il gateway rifiuta entrambi i casi.

Ogni parametro deve comparire una sola volta.

### Quantizzazione dell'area

Il raggio è arrotondato per eccesso a {25, 50, 100, 150} NM. Il centro è agganciato a una
griglia di 0,1° (≤ 50 NM), 0,25° (100 NM) o 0,5° (150 NM). Tutti i client nella stessa cella
ricevono **la stessa risposta, byte per byte**. A 150 NM lo scarto massimo del centro è ≈ 21 NM
all'equatore, ≈ 18 NM a 45° (≤ 14% del raggio). La risposta riporta l'`area` interrogata.

## Cache

| Livello | Dove                               | Condivisa fra                     | Contenuto                                  |
| ------- | ---------------------------------- | --------------------------------- | ------------------------------------------ |
| L1      | memoria dell'isolate (max 64 aree) | richieste dello stesso isolate    | fotografie + coalescing delle richieste    |
| L2      | Cache API `caches.default`         | tutti gli isolate del data center | fotografie, lock di aggiornamento, breaker |

- **Freschezza 30 s** per area. Entro 30 s nessuna nuova chiamata upstream per quell'area.
- **Stale 120 s** oltre la freschezza: la fotografia precedente è servita (marcata `stale`) solo se
  l'upstream è in errore/pausa o se un altro isolate sta già aggiornando l'area.
- **Chiavi sintetiche** costruite solo dall'area quantizzata, es.
  `https://aircraft.alessandropezzali.it/__cache/v2/adsb.lol/aircraft/45/7.5/150`: nessun
  parametro del client, nessun `Origin`, nessun `Vary`. Gli header CORS si aggiungono per richiesta.
- **Lock di aggiornamento** (8 s) nella Cache API: scaduta la freschezza, un solo isolate per data
  center chiama ADSB.lol; gli altri servono la fotografia precedente. A freddo (nessuna
  fotografia) attendono fino a 3 s la fotografia dell'altro isolate, poi 503 `gateway_busy` —
  mai una chiamata upstream in parallelo.
- **Breaker condiviso**: dopo un errore upstream il marcatore nella Cache API ferma tutti gli
  isolate del data center fino alla scadenza.
- La Cache API **funziona solo sul Custom Domain** e **non replica fra data center**
  (`cache.put` non usa la Tiered Cache). Su `*.workers.dev` non ha effetto: per questo
  `workers_dev` e gli URL di anteprima sono disattivati in `wrangler.toml`.
- Qualunque errore della Cache API è ignorato (log `console.warn`): il gateway degrada a L1.

Header per richiesta (il corpo è condiviso, quindi non li contiene):

| Header                      | Valori                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `X-EarthRadar-Cache`        | `hit` (L1) · `edge` (L2) · `miss` · `coalesced` · `stale` · `none`                                     |
| `X-EarthRadar-Stale-Reason` | solo con `stale`: `refreshing` oppure il `reason` dell'errore upstream                                 |
| `Age`                       | secondi da `fetchedAt`                                                                                 |
| `Cache-Control`             | `public, max-age=30` (il browser la considera fresca per 30 − `Age` s); `no-store` per stale ed errori |
| `Retry-After`               | su errori e stale                                                                                      |

### Risposta (v1)

```jsonc
{
  "v": 1,
  "status": "ok", // ok | unavailable | rate_limited
  "reason": null, // upstream_timeout | upstream_network | upstream_http_4xx |
  // upstream_http_5xx | upstream_429 | upstream_invalid | gateway_busy
  "provider": {
    "id": "adsb.lol",
    "name": "ADSB.lol",
    "url": "https://www.adsb.lol/",
    "attribution": "Aircraft data © ADSB.lol contributors, Open Database License (ODbL) 1.0",
    "license": {
      "id": "ODbL-1.0",
      "name": "…",
      "url": "https://opendatacommons.org/licenses/odbl/1-0/",
    },
  },
  "area": { "lat": 44.7, "lon": 10.6, "radiusNm": 50 },
  "providerTime": 1790510015501, // ms epoch del provider
  "fetchedAt": 1790510016000, // quando il gateway ha ottenuto i dati (null se nessun dato)
  "ttlS": 30,
  "retryAfterS": null,
  "count": 31,
  "stats": { "upstreamTotal": 31, "dropped": { "invalid": 0, "stalePosition": 0, "duplicate": 0 } },
  "aircraft": [
    {
      "id": "3d7e93", // = icao24; per LADD/PIA "anon-<12 hex>"
      "icao24": "3d7e93", // null per LADD/PIA
      "callsign": "DFUEL",
      "registration": "D-FUEL",
      "typeCode": "PC12",
      "category": "A1",
      "lat": 45.12197,
      "lon": 9.6251,
      "onGround": false,
      "altBaroM": 8534,
      "altGeomM": 8954,
      "groundSpeedMs": 140.5,
      "trackDeg": 42.3,
      "trackSource": "track",
      "verticalRateMs": 0,
      "squawk": "0451",
      "emergency": null,
      "positionSource": "adsb",
      "positionAgeS": 0.1,
      "lastSeenS": 0,
      "privacyRestricted": false,
    },
  ],
}
```

Le risposte di errore hanno la stessa forma, con `aircraft: []`, `count: 0` e header
`Retry-After`. **Il gateway non restituisce mai dati inventati o di riempimento.**

## Normalizzazione (ADSB.lol → AircraftDTO)

| ADSB.lol                                | DTO                       | Regola                                                                |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------------- |
| `hex`                                   | `id`, `icao24`            | minuscolo, `~` conservato (indirizzo non ICAO); non valido → scartato |
| `lat`, `lon`                            | `lat`, `lon`              | obbligatori e nel range, altrimenti scartato; 5 decimali (~1 m)       |
| `seen_pos`                              | `positionAgeS`            | > 60 s → aereo scartato (posizione non attuale)                       |
| `alt_baro`                              | `altBaroM`, `onGround`    | piedi × 0,3048; `"ground"` → a terra, quota null                      |
| `alt_geom`                              | `altGeomM`                | piedi × 0,3048                                                        |
| `gs`                                    | `groundSpeedMs`           | nodi × 0,514444                                                       |
| `track` → `true_heading` → `calc_track` | `trackDeg`, `trackSource` | primo disponibile; `mag_heading` mai usato; nessuno → null            |
| `baro_rate` → `geom_rate`               | `verticalRateMs`          | ft/min × 0,00508                                                      |
| `type`                                  | `positionSource`          | adsb / mlat / tisb / modes / other                                    |
| `dbFlags` & 4 (PIA) o & 8 (LADD)        | `privacyRestricted`       | **oscuramento completo** (vedi sotto)                                 |

Campi assenti restano `null`: nessuna quota, direzione o posizione viene stimata. La lista è
ordinata per `id`, così l'ordine upstream (che dipende dall'indirizzo) non trapela.

### LADD / PIA

Per gli aerei con `dbFlags` LADD o PIA **non vengono mai esposti** callsign, registrazione né
indirizzo ICAO originale (`callsign`, `registration`, `icao24` = `null`). Il campo `id` è un
token `anon-<12 hex>` **casuale** (`crypto.getRandomValues`), non derivato dall'indirizzo: non è
reversibile, nemmeno per forza bruta sui 2^24 indirizzi. La tabella indirizzo → token esiste solo
nella memoria dell'isolate, non viene mai serializzata ed è svuotata ogni ora: il token resta
stabile fra un aggiornamento e l'altro (per animare l'aereo nella UI) ma non oltre l'ora né fra
isolate diversi. Restano visibili tipo, categoria, posizione e cinematica.

## Protezioni

- **CORS allowlist** (`ALLOWED_ORIGINS` in `wrangler.toml`): origine esatta, mai `*`.
  Origini non ammesse → 403. Richieste senza `Origin` (curl, monitoraggio) sono servite senza
  header CORS.
- **Cache a due livelli** con lock e breaker condivisi (vedi sopra).
- **Coalescing**: richieste concorrenti per la stessa area → una sola chiamata upstream; il fetch
  è protetto da `ctx.waitUntil`.
- **Throttle upstream**: almeno 1,1 s tra due chiamate a ADSB.lol dallo stesso isolate, max 4 in
  attesa; oltre → 503 `gateway_busy` (nessuna chiamata effettuata).
- **Timeout upstream** 6 s → 504 `upstream_timeout`.
- **Circuit breaker** dopo un errore: 429 → pausa `Retry-After` limitata a [10 s, 300 s]
  (default 30 s); 5xx → 30 s; 4xx → 60 s; timeout / rete / payload invalido → 15 s.
  Durante la pausa il gateway serve la fotografia stale se c'è, altrimenti 503, senza chiamare
  l'upstream. La pausa è propagata agli altri isolate del data center tramite la Cache API.

## Licenza dei dati

I dati ADSB.lol sono distribuiti sotto **ODbL 1.0**. Il JSON normalizzato è un database derivato
e resta sotto ODbL: ogni risposta include `provider.attribution` e `provider.license`, che il
frontend deve mostrare. Il codice del Worker è MIT come il resto del repository.

## Sviluppo

```bash
cd workers/aircraft-gateway
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run dev       # wrangler dev locale (http://127.0.0.1:8787), nessun login richiesto
npm run build:dry # bundle senza deploy
npm run measure   # misure reali su api.adsb.lol (6 richieste, distanziate)
```

`wrangler dev` usa la Cache API locale di workerd (persistita in `.wrangler/state`): per provare
la cache senza consumare quota ADSB.lol puntare `UPSTREAM_BASE_URL` a un server finto
(`--var UPSTREAM_BASE_URL:http://127.0.0.1:8799`).

Il deploy (`npm run deploy`) richiede `wrangler login` sull'account Cloudflare del progetto e
crea il Custom Domain `aircraft.alessandropezzali.it` (zona DNS già su Cloudflare).

## Chiamate upstream attese

Per ogni **cella** (area quantizzata) e per ogni **data center** Cloudflare: al massimo
1 chiamata ogni 30 s → **≤ 120 chiamate/ora**, indipendentemente dal numero di utenti, e solo
se qualcuno sta guardando quell'area. Utenti serviti da data center diversi (es. MXP e FCO)
moltiplicano il limite per il numero di data center. Unica eccezione residua: due isolate che
controllano il lock nello stesso istante (finestra di pochi ms fra `match` e `put`).

## Limiti noti

- **Richieste al Worker (piano Free: 100.000/giorno)**: ogni poll di ogni utente è una
  richiesta, anche se servita dalla cache. Con poll a 30 s un utente continuo ≈ 2.880/giorno,
  quindi ≈ 35 utenti continui esauriscono la quota giornaliera. Il frontend deve fare poll ogni
  30 s, fermarsi con la scheda nascosta e rispettare `Retry-After`.
- ADSB.lol limita a circa 1 richiesta/s per IP e risponde 429 senza `Retry-After`. Gli isolate
  Cloudflare condividono IP di uscita: con molti utenti in aree diverse sono possibili 429,
  gestiti dal breaker e segnalati al client.
- Termini ADSB.lol: uso gratuito oggi; in futuro potrebbe servire una API key ottenuta
  contribuendo con un ricevitore, e per uso in produzione chiedono di essere contattati.
- CPU del piano Free (10 ms per richiesta): su un _miss_ in un'area densa parse +
  normalizzazione + serializzazione costano ~5–9 ms a regime misurati a 250 NM (a 150 NM l'area è
  ~36%). Hit ed edge non riserializzano: il corpo è servito così com'è.
