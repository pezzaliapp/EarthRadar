export const SERVICE_NAME = 'earthradar-aircraft-gateway';
export const SERVICE_VERSION = '0.1.0';

/** Limite documentato da ADSB.lol per /v2/point (NON applicato lato server: lo imponiamo noi). */
export const MAX_RADIUS_NM = 250;

/** Gradini di raggio: il client può chiedere qualunque intero 1..250, noi arrotondiamo per eccesso. */
export const RADIUS_BUCKETS_NM = [25, 50, 100, 150, 250] as const;

export const UPSTREAM_TIMEOUT_MS = 6_000;
export const DEFAULT_UPSTREAM_BASE_URL = 'https://api.adsb.lol';
export const USER_AGENT = `EarthRadar-aircraft-gateway/${SERVICE_VERSION} (+https://www.alessandropezzali.it/EarthRadar/)`;

/** Freschezza della cache per isolate: allineata al refresh reale del provider. */
export const CACHE_TTL_MS = 10_000;
export const CACHE_MAX_ENTRIES = 64;

/** Posizioni più vecchie di così vengono scartate: non le mostriamo come "attuali". */
export const MAX_POSITION_AGE_S = 60;

/** max-age lato browser per le risposte ok. */
export const SUCCESS_BROWSER_MAX_AGE_S = 5;

/**
 * ADSB.lol limita a circa 1 richiesta/s per IP (429 misurati già alla 2ª
 * richiesta ravvicinata, senza Retry-After). Distanziamo le chiamate upstream
 * di ogni isolate; oltre `UPSTREAM_MAX_QUEUE` attese rispondiamo "busy".
 */
export const UPSTREAM_MIN_INTERVAL_MS = 1_100;
export const UPSTREAM_MAX_QUEUE = 4;

/** Pausa delle chiamate upstream dopo un errore (circuit breaker, per isolate). */
export const BREAKER_MS = {
  /** 429 senza Retry-After: la finestra di ADSB.lol osservata è di pochi secondi. */
  rateLimitedDefault: 15_000,
  rateLimitedMin: 5_000,
  rateLimitedMax: 300_000,
  http5xx: 30_000,
  http4xx: 60_000,
  transient: 15_000,
} as const;
