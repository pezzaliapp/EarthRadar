export const SERVICE_NAME = 'earthradar-aircraft-gateway';
export const SERVICE_VERSION = '0.4.0';

/**
 * Raggio massimo ASSOLUTO accettato dal gateway (decisione di progetto).
 * EarthRadar non va mai oltre 150 NM: richieste con `r` > 150 sono
 * rifiutate con 400, non ridotte in silenzio.
 */
export const MAX_RADIUS_NM = 150;

/** Il contratto pubblico è in NM; FlyItalyADSB vuole il raggio in km. */
export const NM_TO_KM = 1.852;

/** Gradini di raggio: il client può chiedere qualunque intero 1..150, noi arrotondiamo per eccesso. */
export const RADIUS_BUCKETS_NM = [25, 50, 100, 150] as const;

export const UPSTREAM_TIMEOUT_MS = 6_000;
export const DEFAULT_UPSTREAM_BASE_URL = 'https://api.flyitalyadsb.com/v2';
export const USER_AGENT = `EarthRadar-aircraft-gateway/${SERVICE_VERSION} (+https://www.alessandropezzali.it/EarthRadar/)`;

/**
 * Freschezza di una fotografia di un'area: entro questo intervallo nessuna
 * nuova chiamata upstream per la stessa area (per data center Cloudflare).
 * 30 s: il provider è un servizio gratuito con quota per chiave (vedi
 * UPSTREAM_BUDGET). Meglio dati un po' meno recenti che saturarlo. Valore
 * normale: si allunga solo vicino ai limiti (ADAPTIVE_TTL_STEPS).
 */
export const CACHE_FRESH_TTL_S = 30;

/**
 * Oltre la freschezza, la fotografia resta disponibile come "stale" per
 * questo tempo: servita (marcata) solo se l'upstream è in errore, in pausa
 * o se un altro isolate sta già aggiornando la stessa area.
 */
export const CACHE_STALE_S = 120;

/** Aree tenute nella cache in memoria di ogni isolate. */
export const CACHE_MAX_ENTRIES = 64;

/**
 * Origine delle chiavi sintetiche della Cache API (zona Cloudflare del
 * gateway). Le chiavi non coincidono mai con URL pubblici del Worker.
 */
export const EDGE_CACHE_KEY_ORIGIN = 'https://aircraft.alessandropezzali.it';
export const EDGE_CACHE_KEY_PREFIX = '/__cache/v2';

/**
 * Lock di aggiornamento condiviso fra isolate dello stesso data center:
 * copre al massimo il timeout upstream più un margine.
 */
export const REFRESH_LOCK_S = 8;
/** Senza fotografia disponibile e con lock altrui: attese brevi sulla Cache API. */
export const REFRESH_WAIT_STEPS = 3;
export const REFRESH_WAIT_STEP_MS = 1_000;

/** Posizioni più vecchie di così vengono scartate: non le mostriamo come "attuali". */
export const MAX_POSITION_AGE_S = 60;

/**
 * ID anonimi per aerei LADD/PIA: casuali, mai derivati dall'indirizzo ICAO,
 * validi solo nella memoria dell'isolate e rigenerati a ogni rotazione.
 */
export const ANON_ID_ROTATE_MS = 60 * 60 * 1000;
export const ANON_ID_MAX_ENTRIES = 5_000;

/**
 * Distanziamo le chiamate upstream di ogni isolate (freno LOCALE: il limite
 * globale della chiave è il budget del Durable Object); oltre
 * `UPSTREAM_MAX_QUEUE` attese rispondiamo "busy".
 */
export const UPSTREAM_MIN_INTERVAL_MS = 1_100;
export const UPSTREAM_MAX_QUEUE = 4;

/**
 * Budget GLOBALE della chiave FlyItalyADSB (Durable Object unico, vedi
 * budget/ledger.ts). Limiti del provider dal 27/10/2026: 30 richieste/min,
 * 300.000/mese. Margini: 24/min (e 4 ogni 10 s, contro le raffiche),
 * 9.500 per 24 h mobili, 285.000 per 30 giorni mobili → qualunque periodo di
 * 31 giorni ≤ 294.500, comunque si definisca il "mese".
 */
export const UPSTREAM_BUDGET = {
  perTenSeconds: 4,
  perMinute: 24,
  perDay: 9_500,
  perThirtyDays: 285_000,
} as const;

/**
 * Freschezza adattiva: solo quando una quota supera l'80% (o il 95%) le
 * fotografie durano 60 s (o 120 s). Sotto, sempre CACHE_FRESH_TTL_S.
 */
export const ADAPTIVE_TTL_STEPS = [
  { atRatio: 0.8, ttlS: 60 },
  { atRatio: 0.95, ttlS: 120 },
] as const;
export const MAX_FRESH_TTL_S = 120;

/** Nome dell'unica istanza del Durable Object (una per chiave del provider). */
export const UPSTREAM_BUDGET_OBJECT_NAME = 'flyitalyadsb-global';
/** Oltre questa attesa il budget è "non disponibile": nessuna chiamata upstream. */
export const UPSTREAM_BUDGET_TIMEOUT_MS = 3_000;
/** Pausa locale (breaker) dopo un rifiuto del budget. */
export const BUDGET_DENIED_PAUSE_MS = { min: 1_000, max: 300_000 } as const;

/** Pausa delle chiamate upstream dopo un errore (circuit breaker, condiviso via Cache API). */
export const BREAKER_MS = {
  /** 429 senza Retry-After: prudenza, la quota è gratuita. */
  rateLimitedDefault: 30_000,
  rateLimitedMin: 10_000,
  rateLimitedMax: 300_000,
  http5xx: 30_000,
  http4xx: 60_000,
  transient: 15_000,
  /** Durable Object del budget irraggiungibile: nessuna chiamata upstream. */
  budgetUnavailable: 15_000,
} as const;
