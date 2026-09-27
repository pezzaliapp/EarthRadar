# EarthRadar — aircraft gateway

Cloudflare Worker (piano **Free**, nessun binding a pagamento) che fa da gateway tra la PWA
EarthRadar e il provider ADS-B **ADSB.lol**.

```
EarthRadar PWA ──► Worker (CORS · validazione · throttle · cache · breaker) ──► api.adsb.lol /v2/point
                        │
                        └── JSON normalizzato v1 (AircraftDTO)
```

Perché serve: ADSB.lol non invia header CORS, quindi il browser non può chiamarlo
direttamente. Il Worker non contiene secret (ADSB.lol oggi non richiede chiavi).

## Endpoint

| Metodo  | Path                        | Descrizione                                                                                       |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| GET     | `/v1/health`                | Stato del gateway (per isolate): breaker, ultima chiamata upstream, cache. Non chiama l'upstream. |
| GET     | `/v1/aircraft?lat=&lon=&r=` | Aerei entro `r` miglia nautiche da (`lat`, `lon`).                                                |
| OPTIONS | `*`                         | Preflight CORS.                                                                                   |

Parametri di `/v1/aircraft` (validazione rigorosa, altrimenti **400 `invalid_params`**):

- `lat`: decimale in [-90, 90], max 8 decimali, niente notazione esponenziale;
- `lon`: decimale in [-180, 180];
- `r`: **intero** in [1, 250]. ADSB.lol documenta 250 NM come massimo ma non lo impone, e un
  raggio decimale produce una risposta non JSON: per questo il gateway rifiuta entrambi i casi.

Ogni parametro deve comparire una sola volta.

### Quantizzazione dell'area

Il raggio è arrotondato per eccesso a {25, 50, 100, 150, 250} NM. Il centro è agganciato a una
griglia di 0,1° (≤ 50 NM), 0,25° (≤ 150 NM) o 0,5° (250 NM). Client vicini condividono così la
stessa voce di cache. La risposta riporta sia `requested` sia l'`area` effettivamente interrogata.

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
  "requested": { "lat": 44.698, "lon": 10.631, "radiusNm": 50 },
  "providerTime": 1790510015501, // ms epoch del provider
  "servedAt": 1790510016000,
  "cache": "miss", // hit | miss | coalesced | none
  "retryAfterS": null,
  "count": 31,
  "stats": { "upstreamTotal": 31, "dropped": { "invalid": 0, "stalePosition": 0, "duplicate": 0 } },
  "aircraft": [
    {
      "icao24": "3d7e93",
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
| `hex`                                   | `icao24`                  | minuscolo, `~` conservato (indirizzo non ICAO); non valido → scartato |
| `lat`, `lon`                            | `lat`, `lon`              | obbligatori e nel range, altrimenti scartato; 5 decimali (~1 m)       |
| `seen_pos`                              | `positionAgeS`            | > 60 s → aereo scartato (posizione non attuale)                       |
| `alt_baro`                              | `altBaroM`, `onGround`    | piedi × 0,3048; `"ground"` → a terra, quota null                      |
| `alt_geom`                              | `altGeomM`                | piedi × 0,3048                                                        |
| `gs`                                    | `groundSpeedMs`           | nodi × 0,514444                                                       |
| `track` → `true_heading` → `calc_track` | `trackDeg`, `trackSource` | primo disponibile; `mag_heading` mai usato; nessuno → null            |
| `baro_rate` → `geom_rate`               | `verticalRateMs`          | ft/min × 0,00508                                                      |
| `type`                                  | `positionSource`          | adsb / mlat / tisb / modes / other                                    |
| `dbFlags` & 4 (PIA) o & 8 (LADD)        | `privacyRestricted`       | **callsign e registrazione oscurati**                                 |

Campi assenti restano `null`: nessuna quota, direzione o posizione viene stimata.

## Protezioni

- **CORS allowlist** (`ALLOWED_ORIGINS` in `wrangler.toml`): origine esatta, mai `*`.
  Origini non ammesse → 403. Richieste senza `Origin` (curl, monitoraggio) sono servite senza
  header CORS.
- **Cache in memoria per isolate** (TTL 10 s, max 64 aree), compatibile con `*.workers.dev`
  dove la Cache API non è disponibile. Best-effort: isolate diversi non condividono la cache.
- **Coalescing**: richieste concorrenti per la stessa area → una sola chiamata upstream; il fetch
  è protetto da `ctx.waitUntil`.
- **Throttle upstream**: almeno 1,1 s tra due chiamate a ADSB.lol dallo stesso isolate, max 4 in
  attesa; oltre → 503 `gateway_busy` (nessuna chiamata effettuata).
- **Timeout upstream** 6 s → 504 `upstream_timeout`.
- **Circuit breaker** dopo un errore: 429 → pausa `Retry-After` limitata a [5 s, 300 s]
  (default 15 s); 5xx → 30 s; 4xx → 60 s; timeout / rete / payload invalido → 15 s.
  Durante la pausa il gateway risponde 503 senza chiamare l'upstream.

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

Il deploy (`npm run deploy`) richiede `wrangler login` sull'account Cloudflare del progetto e
**non** fa parte dello STEP 1.

## Limiti noti

- ADSB.lol limita a circa 1 richiesta/s per IP e risponde 429 senza `Retry-After`. Gli isolate
  Cloudflare condividono IP di uscita: con molti utenti in aree diverse sono possibili 429,
  gestiti dal breaker e segnalati al client.
- Termini ADSB.lol: uso gratuito oggi; in futuro potrebbe servire una API key ottenuta
  contribuendo con un ricevitore, e per uso in produzione chiedono di essere contattati.
- CPU del piano Free (10 ms per richiesta): su un _miss_ in un'area densa da 250 NM
  parse + normalizzazione + serializzazione costano ~5–9 ms a regime, di più a isolate freddo.
  Vedi le misure nel messaggio di commit / PR.
