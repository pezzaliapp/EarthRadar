export const SERVICE_NAME = 'earthradar-aircraft-gateway';
export const SERVICE_VERSION = '0.2.0';

/**
 * Raggio massimo ASSOLUTO accettato dal gateway (decisione di progetto).
 * ADSB.lol documenta 250 NM, ma EarthRadar non va mai oltre 150: richieste
 * con `r` > 150 sono rifiutate con 400, non ridotte in silenzio.
 */
export const MAX_RADIUS_NM = 150;

/** Gradini di raggio: il client può chiedere qualunque intero 1..150, noi arrotondiamo per eccesso. */
export const RADIUS_BUCKETS_NM = [25, 50, 100, 150] as const;

export const UPSTREAM_TIMEOUT_MS = 6_000;
export const DEFAULT_UPSTREAM_BASE_URL = 'https://api.adsb.lol';
export const USER_AGENT = `EarthRadar-aircraft-gateway/${SERVICE_VERSION} (+https://www.alessandropezzali.it/EarthRadar/)`;

/**
 * Freschezza di una fotografia di un'area: entro questo intervallo nessuna
 * nuova chiamata upstream per la stessa area (per data center Cloudflare).
 * 30 s: ADSB.lol risponde 429 già alla 2ª richiesta ravvicinata dallo stesso
 * IP, e le uscite Cloudflare sono IP condivisi. Meglio dati un po' meno
 * recenti che saturare un servizio gratuito.
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
 * ADSB.lol limita a circa 1 richiesta/s per IP (429 misurati già alla 2ª
 * richiesta ravvicinata, senza Retry-After). Distanziamo le chiamate upstream
 * di ogni isolate; oltre `UPSTREAM_MAX_QUEUE` attese rispondiamo "busy".
 */
export const UPSTREAM_MIN_INTERVAL_MS = 1_100;
export const UPSTREAM_MAX_QUEUE = 4;

/** Pausa delle chiamate upstream dopo un errore (circuit breaker, condiviso via Cache API). */
export const BREAKER_MS = {
  /** 429 senza Retry-After: prudenza, la quota è gratuita. */
  rateLimitedDefault: 30_000,
  rateLimitedMin: 10_000,
  rateLimitedMax: 300_000,
  http5xx: 30_000,
  http4xx: 60_000,
  transient: 15_000,
} as const;
