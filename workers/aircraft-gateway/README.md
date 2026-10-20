# EarthRadar — aircraft gateway

Cloudflare Worker (piano **Workers Free**, nessun servizio a pagamento) che fa da gateway tra la PWA
EarthRadar e il provider ADS-B **FlyItalyADSB** (REST API v2).

```
EarthRadar PWA ──► https://aircraft.alessandropezzali.it (Worker su Custom Domain)
                     │  CORS · validazione · quantizzazione
                     ├─ L1 memoria isolate + coalescing
                     ├─ L2 Cache API del data center (fotografie, lock, breaker condivisi)
                     ├─ throttle · breaker
                     ├─ permesso del budget GLOBALE ──► Durable Object UpstreamBudget (SQLite, unico)
                     └─► api.flyitalyadsb.com/v2/lat/…/lon/…/dist/{km}  (≤ 1 chiamata / 30 s per area, ≤ 24/min in totale)
```

Perché serve: FlyItalyADSB richiede una API key, che non deve mai arrivare al browser. La chiave
è il secret Cloudflare **`FLYITALYADSB_API_KEY`** (`npx wrangler secret put FLYITALYADSB_API_KEY`):
viene usata solo nell'header `X-Api-Key` della chiamata upstream e non compare mai nel codice,
in `wrangler.toml`, nei log o nelle risposte. Senza chiave il gateway risponde 503
`provider_not_configured` senza chiamare il provider.

Storia: il primo provider era ADSB.lol, che dagli IP di uscita di Cloudflare rispondeva 429 già
alla prima chiamata (mentre dal client locale rispondeva 200): sostituito con FlyItalyADSB.

**Il provider è una risorsa gratuita da proteggere**: il gateway è progettato per minimizzare le
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
  (mai ridotto in silenzio). Il contratto pubblico resta in NM; verso FlyItalyADSB il raggio è
  convertito in km (`km = NM × 1,852`, arrotondato per eccesso: 50 NM → 93 km, 150 NM → 278 km).

Ogni parametro deve comparire una sola volta.

### Quantizzazione dell'area

Il raggio è arrotondato per eccesso a {25, 50, 100, 150} NM. Il centro è agganciato a una
griglia di 0,1° (≤ 50 NM), 0,25° (100 NM) o 0,5° (150 NM). Tutti i client nella stessa cella
ricevono **la stessa risposta, byte per byte**. A 150 NM lo scarto massimo del centro è ≈ 21 NM
all'equatore, ≈ 18 NM a 45° (≤ 14% del raggio). La risposta riporta l'`area` interrogata.

## Budget globale della chiave (Durable Object)

Dal 27/10/2026 la chiave FlyItalyADSB ha limiti **per chiave**: 30 richieste/min, 300.000/mese,
raggio ≤ 500 km (il gateway usa al massimo 150 NM = 278 km). Throttle e breaker sono per
isolate o per data center: da soli non garantiscono un limite globale. Per questo **ogni**
chiamata upstream richiede prima un permesso dal Durable Object `UpstreamBudgetObject`
(binding `UPSTREAM_BUDGET`, una sola istanza: `idFromName("flyitalyadsb-global")`).

| Finestra (sempre mobile) | Limite  | Perché                                               |
| ------------------------ | ------- | ---------------------------------------------------- |
| 10 s                     | 4       | niente raffiche (con 24/min: ≤ 28 in qualunque 61 s) |
| 60 s                     | 24      | 20% sotto i 30/min del provider                      |
| 24 h                     | 9.500   | tetto giornaliero                                    |
| 30 giorni                | 285.000 | qualunque periodo di 31 giorni ≤ 294.500 < 300.000   |

- **Nessuna ipotesi sul "mese"**: finestre mobili, mai giorni o mesi di calendario. Le finestre
  di 24 h e 30 giorni usano contatori orari e sommano anche l'ora più vecchia solo in parte
  dentro la finestra: il conteggio è sempre per eccesso.
- **Concorrenza**: il Durable Object elabora un evento alla volta e la decisione è sincrona
  (SQLite di `ctx.storage.sql` è sincrono): due richieste non ottengono mai lo stesso posto.
  Il permesso si chiede dopo l'attesa del throttle, subito prima dell'invio.
- **Ogni permesso conta**, anche se la chiamata poi fallisce (il provider potrebbe contarla).
- **429 del provider** → `POST /rate-limited` al Durable Object: pausa globale (10–300 s) per
  tutti i data center.
- **Fail closed**: binding assente, Durable Object irraggiungibile, in timeout (3 s) o in errore
  (es. quota SQLite Free esaurita) → **nessuna chiamata upstream**; 503 `budget_unavailable`
  oppure fotografia stale. Rifiuto del budget → 503 `upstream_budget` con `Retry-After`, oppure
  stale. In entrambi i casi la pausa è condivisa nel data center (breaker), così gli altri
  isolate non interrogano il Durable Object.
- **Stub nuovo a ogni chiamata**: il runtime lega lo stub alla richiesta che l'ha creato.
- **Freschezza adattiva**: 30 s in condizioni normali. Solo se una quota supera l'80% → 60 s,
  oltre il 95% → 120 s. Il valore viaggia nella fotografia (`ttlS`, `Cache-Control`,
  `X-EarthRadar-Ttl` nella Cache API): il frontend allinea già poll e replay a `ttlS`.
- **Costo €0 sul piano Workers Free**: backend SQLite (l'unico ammesso sul Free; migrazione
  `new_sqlite_classes`). Righe scritte: 2 per permesso (≤ ~19.000/giorno al tetto, limite Free
  100.000); letture solo all'avvio dell'oggetto; richieste al Durable Object ≈ permessi +
  rifiuti (≤ 1 per pausa per data center). Oltre le quote Free le operazioni falliscono, non
  vengono addebitate, e il gateway non chiama il provider.
- `/v1/health` riporta `lastBudget` (ultima risposta vista da quell'isolate) e **non** interroga
  il Durable Object.

## Cache

| Livello | Dove                               | Condivisa fra                     | Contenuto                                  |
| ------- | ---------------------------------- | --------------------------------- | ------------------------------------------ |
| L1      | memoria dell'isolate (max 64 aree) | richieste dello stesso isolate    | fotografie + coalescing delle richieste    |
| L2      | Cache API `caches.default`         | tutti gli isolate del data center | fotografie, lock di aggiornamento, breaker |

- **Freschezza 30 s** per area (60/120 s solo vicino ai limiti del budget, vedi sopra). Entro la
  freschezza nessuna nuova chiamata upstream per quell'area.
- **Stale 120 s** oltre la freschezza: la fotografia precedente è servita (marcata `stale`) solo se
  l'upstream è in errore/pausa o se un altro isolate sta già aggiornando l'area.
- **Chiavi sintetiche** costruite solo dall'area quantizzata, es.
  `https://aircraft.alessandropezzali.it/__cache/v2/flyitalyadsb/aircraft/45/7.5/150`: nessun
  parametro del client, nessun `Origin`, nessun `Vary`. Gli header CORS si aggiungono per richiesta.
- **Lock di aggiornamento** (8 s) nella Cache API: scaduta la freschezza, un solo isolate per data
  center chiama il provider; gli altri servono la fotografia precedente. A freddo (nessuna
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
    "id": "flyitalyadsb",
    "name": "FlyItalyADSB",
    "url": "https://flyitalyadsb.com/",
    "attribution": "Aircraft data: FlyItalyADSB (flyitalyadsb.com) · ADS-B/MLAT data · CC BY-SA 4.0",
    "license": {
      "id": "CC-BY-SA-4.0",
      "name": "…",
      "url": "https://creativecommons.org/licenses/by-sa/4.0/",
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

## Normalizzazione (formato readsb di FlyItalyADSB → AircraftDTO)

| readsb                                  | DTO                       | Regola                                                                |
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
- **Throttle upstream**: almeno 1,1 s tra due chiamate al provider dallo stesso isolate, max 4 in
  attesa; oltre → 503 `gateway_busy` (nessuna chiamata effettuata).
- **Timeout upstream** 6 s → 504 `upstream_timeout`.
- **Circuit breaker** dopo un errore: 429 → pausa `Retry-After` limitata a [10 s, 300 s]
  (default 30 s); 5xx → 30 s; 4xx → 60 s; timeout / rete / payload invalido → 15 s.
  Durante la pausa il gateway serve la fotografia stale se c'è, altrimenti 503, senza chiamare
  l'upstream. La pausa è propagata agli altri isolate del data center tramite la Cache API.

## Licenza dei dati

I dati FlyItalyADSB sono distribuiti sotto **CC BY-SA 4.0** (attribuzione obbligatoria, opere
derivate con la stessa licenza). Uso commerciale consentito entro il limite standard di
100 richieste/min per IP. Citazione indicata dal provider:
"FlyItalyADSB (flyitalyadsb.com) · ADS-B/MLAT data · License CC BY-SA 4.0". Ogni risposta
include `provider.attribution` e `provider.license`, che il frontend deve mostrare. Il codice del Worker è MIT come il resto del repository.

## Sviluppo

```bash
cd workers/aircraft-gateway
npm install
npm test               # vitest — la rete reale è BLOCCATA (test/setup.ts)
npm run typecheck      # tsc --noEmit
npm run dev:fake-upstream   # provider FINTO su http://127.0.0.1:8799 (nessuna chiamata reale)
npm run dev                 # wrangler dev locale contro il provider finto, chiave finta
npm run build:dry      # bundle senza deploy
EARTHRADAR_CONFIRM_REAL_QUOTA=6 FLYITALYADSB_API_KEY=… npm run measure   # 6 richieste REALI
```

**Nessun comando di manutenzione consuma la quota reale per sbaglio**:

- `npm test`: provider e Durable Object finti; ogni `fetch` reale fa fallire il test.
- `npm run dev`: punta al provider finto con una chiave finta. Il secret reale vive solo su
  Cloudflare e `wrangler dev` locale non lo legge (non esiste `.dev.vars`). Mai
  `wrangler dev --remote`.
- `npm run measure`: chiama FlyItalyADSB davvero (6 richieste, **fuori** dal budget di
  produzione); parte solo con `EARTHRADAR_CONFIRM_REAL_QUOTA=6`.
- `/v1/health` non chiama né il provider né il Durable Object.

Il deploy (`npm run deploy`) richiede `wrangler login` sull'account Cloudflare del progetto
(piano **Workers Free**) e usa il Custom Domain `aircraft.alessandropezzali.it`.

## Rollback e arresto d'emergenza

Cloudflare **non consente** `wrangler rollback` verso una versione precedente a un cambio di
ciclo di vita di una classe Durable Object: dalla 0.4.0 non si torna alla 0.3.0 con
`wrangler rollback`. Rimuovere la classe richiederebbe `deleted_classes` (cancellazione
definitiva dei dati): **mai** come rollback. Procedure, dalla più rapida:

1. **Arresto d'emergenza (secondi, nessun deploy di codice)**:
   `npx wrangler secret delete FLYITALYADSB_API_KEY` → 503 `provider_not_configured`, zero
   chiamate al provider; si spegne solo il livello aerei. Ripristino:
   `npx wrangler secret put FLYITALYADSB_API_KEY`.
2. **Rollback fra versioni 0.4.x** (stessa classe, stessa migrazione): ammesso.
   `npx wrangler deployments list` → `npx wrangler rollback <version-id>`.
3. **Ritorno al comportamento 0.3.0**: deploy del branch `rollback/gateway-0.3.1-compat`
   (codice 0.3.0 + classe `UpstreamBudgetObject` inerte + binding e migrazione identici, stesso
   tag): nessun cambio di ciclo di vita, nessun dato cancellato, il Durable Object non viene mai
   invocato. Senza budget globale valgono solo throttle e breaker per isolate (dopo il
   27/10/2026 possibili 429 dal provider: dati stale, nessun costo).
   `git switch rollback/gateway-0.3.1-compat && cd workers/aircraft-gateway && npx wrangler deploy`
4. Per tornare alla 0.4.x dopo il punto 3: deploy normale del branch principale (lo stato
   SQLite è intatto).

## Chiamate upstream attese

Per ogni **cella** (area quantizzata) e per ogni **data center** Cloudflare: al massimo
1 chiamata ogni 30 s → **≤ 120 chiamate/ora**, e solo se qualcuno sta guardando quell'area.
Utenti serviti da data center diversi (es. MXP e FCO) possono richiamare la stessa cella. **In
ogni caso il totale globale resta entro il budget** (24/min, 9.500 per 24 h, 285.000 per
30 giorni): oltre, i data center servono la fotografia stale o 503 `upstream_budget`. A 30 s,
24/min bastano per circa 12 aree osservate contemporaneamente.

## Limiti noti

- **Richieste al Worker (piano Free: 100.000/giorno)**: ogni poll di ogni utente è una
  richiesta, anche se servita dalla cache. Con poll a 30 s un utente continuo ≈ 2.880/giorno,
  quindi ≈ 35 utenti continui esauriscono la quota giornaliera. Il frontend deve fare poll ogni
  30 s, fermarsi con la scheda nascosta e rispettare `Retry-After`.
- Limiti FlyItalyADSB per chiave (dal 27/10/2026): gestiti dal budget globale; eventuali 429
  aprono il breaker e mettono in pausa il budget per tutti i data center.
- **Budget consumabile da terzi**: il gateway è pubblico e le richieste senza `Origin` sono
  servite. Chi interroga molte aree diverse consuma il budget globale: la chiave resta
  protetta (mai oltre i limiti), ma gli utenti possono ricevere fotografie stale o 503 finché
  il budget non si libera. Protezioni anti-abuso (Turnstile, regola WAF) rimandate a una fase
  successiva.
- `npm run measure` e `wrangler dev` con la chiave vera **non passano dal budget di
  produzione** (lo script chiama il provider direttamente; `wrangler dev` usa un Durable Object
  locale): usarli con parsimonia.
- Il formato della risposta FlyItalyADSB non è documentato pubblicamente: il gateway si aspetta il
  formato readsb (`ac[]`, `now` in ms). Un formato diverso produce 502 `upstream_invalid`, mai
  dati inventati. L'oscuramento LADD/PIA dipende dal campo readsb `dbFlags`.
- CPU del piano Free (10 ms per richiesta): su un _miss_ in un'area densa parse +
  normalizzazione + serializzazione costano ~5–9 ms a regime misurati a 250 NM (a 150 NM l'area è
  ~36%). Hit ed edge non riserializzano: il corpo è servito così com'è.
