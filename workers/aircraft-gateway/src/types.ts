/**
 * Contratto pubblico del gateway (v1). Il frontend EarthRadar consumerà
 * esclusivamente questi tipi: il provider upstream resta un dettaglio interno.
 */

export type PositionSource = 'adsb' | 'mlat' | 'tisb' | 'modes' | 'other';

/** Campo upstream da cui proviene la direzione. `mag_heading` non è mai usato. */
export type TrackSource = 'track' | 'true_heading' | 'calc_track';

export interface AircraftDTO {
  /** Indirizzo ICAO 24-bit in minuscolo. Prefisso `~` = indirizzo non ICAO (es. TIS-B). */
  icao24: string;
  /** Null se assente o oscurato (LADD/PIA). */
  callsign: string | null;
  /** Null se assente o oscurato (LADD/PIA). */
  registration: string | null;
  /** Designatore ICAO del tipo (es. A320). */
  typeCode: string | null;
  /** Categoria emettitore ADS-B (A0..D7). */
  category: string | null;
  lat: number;
  lon: number;
  onGround: boolean;
  /** Quota barometrica in metri. Null se non trasmessa: mai stimata. */
  altBaroM: number | null;
  /** Quota geometrica (GNSS) in metri. Null se non trasmessa. */
  altGeomM: number | null;
  groundSpeedMs: number | null;
  /** Direzione vera 0..360 (0 = nord). Null se nessuna direzione reale disponibile. */
  trackDeg: number | null;
  trackSource: TrackSource | null;
  /** Positivo = salita. */
  verticalRateMs: number | null;
  squawk: string | null;
  emergency: string | null;
  positionSource: PositionSource;
  /** Secondi dall'ultima posizione ricevuta dal provider. */
  positionAgeS: number | null;
  /** Secondi dall'ultimo messaggio di qualunque tipo. */
  lastSeenS: number | null;
  /** True se l'aereo è in LADD o usa un indirizzo PIA: identità oscurata. */
  privacyRestricted: boolean;
}

/** Area circolare: centro in gradi, raggio intero in miglia nautiche. */
export interface Area {
  lat: number;
  lon: number;
  radiusNm: number;
}

export interface LicenseInfo {
  id: string;
  name: string;
  url: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  url: string;
  /** Testo di attribuzione da mostrare all'utente. */
  attribution: string;
  license: LicenseInfo;
}

export type GatewayStatus = 'ok' | 'unavailable' | 'rate_limited';

export type GatewayReason =
  | 'upstream_timeout'
  | 'upstream_network'
  | 'upstream_http_4xx'
  | 'upstream_http_5xx'
  | 'upstream_429'
  | 'upstream_invalid'
  /** Troppe richieste upstream in coda nel gateway: nessuna chiamata effettuata. */
  | 'gateway_busy';

export type CacheOutcome = 'hit' | 'miss' | 'coalesced' | 'none';

export interface NormalizeStats {
  /** Numero di aerei nella risposta upstream prima dei filtri. */
  upstreamTotal: number;
  dropped: {
    /** Hex o coordinate non validi. */
    invalid: number;
    /** Posizione più vecchia della soglia (non mostrata come attuale). */
    stalePosition: number;
    duplicate: number;
  };
}

export interface AircraftResponse {
  v: 1;
  status: GatewayStatus;
  reason: GatewayReason | null;
  provider: ProviderInfo;
  /** Area effettivamente interrogata (quantizzata). */
  area: Area | null;
  /** Area richiesta dal client, dopo validazione. */
  requested: Area | null;
  /** Timestamp del provider (ms epoch), se fornito. */
  providerTime: number | null;
  servedAt: number;
  cache: CacheOutcome;
  retryAfterS: number | null;
  count: number;
  stats: NormalizeStats | null;
  aircraft: AircraftDTO[];
}
