/**
 * Client del gateway EarthRadar per il traffico aereo.
 *
 *   GET https://aircraft.alessandropezzali.it/v1/aircraft?lat=&lon=&r=<NM>
 *
 * Il browser parla SOLO con il gateway: nessuna chiave, nessun provider
 * upstream noto al frontend. Qui si consuma il contratto normalizzato v1
 * del gateway, indipendente dal provider.
 *
 * Nessuna cache applicativa (idb-keyval) per questo servizio, per scelta:
 * la cache vive nel gateway (30 s + stale autorizzato 120 s) e persistere
 * posizioni nel browser significherebbe mostrare dopo un reload posizioni
 * vecchie come se fossero attuali.
 */

export const AIRCRAFT_GATEWAY_URL = 'https://aircraft.alessandropezzali.it/v1/aircraft';

/** Raggio massimo accettato dal gateway (NM). */
export const AIRCRAFT_MAX_RADIUS_NM = 150;

export interface AircraftProviderInfo {
  id: string;
  name: string;
  url: string;
  attribution: string;
  license: { id: string; name: string; url: string };
}

/** Aeromobile secondo il contratto v1 del gateway. Campi assenti = null, mai stimati. */
export interface GatewayAircraft {
  /** Chiave stabile: ICAO per gli aerei normali, token anonimo per LADD/PIA. */
  id: string;
  icao24: string | null;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  lat: number;
  lon: number;
  onGround: boolean;
  altBaroM: number | null;
  altGeomM: number | null;
  groundSpeedMs: number | null;
  trackDeg: number | null;
  verticalRateMs: number | null;
  squawk: string | null;
  emergency: string | null;
  positionSource: string;
  /** Secondi fra la posizione e `providerTime`. */
  positionAgeS: number | null;
  privacyRestricted: boolean;
}

export interface GatewaySnapshot {
  provider: AircraftProviderInfo;
  area: { lat: number; lon: number; radiusNm: number };
  /** ms Unix. */
  providerTime: number | null;
  /** ms Unix: quando il gateway ha ottenuto i dati dal provider. */
  fetchedAt: number;
  ttlS: number;
  aircraft: GatewayAircraft[];
}

export type GatewayResult =
  | {
      kind: 'ok';
      snapshot: GatewaySnapshot;
      /** Il gateway serve una fotografia oltre la freschezza (header X-EarthRadar-Cache: stale). */
      gatewayStale: boolean;
      retryAfterMs: number | null;
    }
  | { kind: 'error'; httpStatus: number | null; reason: string; retryAfterMs: number | null };

// ---------------------------------------------------------------------------
// Parsing difensivo

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseAircraft(v: unknown): GatewayAircraft | null {
  if (!isRec(v)) return null;
  const id = str(v.id);
  const lat = num(v.lat);
  const lon = num(v.lon);
  if (!id || lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const privacyRestricted = v.privacyRestricted === true;
  return {
    id,
    // Oscurati: il frontend non usa (né tenta di ricostruire) alcun identificativo.
    icao24: privacyRestricted ? null : str(v.icao24),
    callsign: privacyRestricted ? null : str(v.callsign),
    registration: privacyRestricted ? null : str(v.registration),
    typeCode: str(v.typeCode),
    lat,
    lon,
    onGround: v.onGround === true,
    altBaroM: num(v.altBaroM),
    altGeomM: num(v.altGeomM),
    groundSpeedMs: num(v.groundSpeedMs),
    trackDeg: num(v.trackDeg),
    verticalRateMs: num(v.verticalRateMs),
    squawk: str(v.squawk),
    emergency: str(v.emergency),
    positionSource: str(v.positionSource) ?? 'other',
    positionAgeS: num(v.positionAgeS),
    privacyRestricted,
  };
}

/** Restituisce null se il corpo non è una fotografia `status: "ok"` valida. */
export function parseGatewaySnapshot(body: unknown): GatewaySnapshot | null {
  if (!isRec(body) || body.v !== 1 || body.status !== 'ok') return null;
  const provider = body.provider;
  const area = body.area;
  const fetchedAt = num(body.fetchedAt);
  const ttlS = num(body.ttlS);
  if (!isRec(provider) || !isRec(area) || fetchedAt === null || ttlS === null) return null;
  if (!Array.isArray(body.aircraft)) return null;
  const license = isRec(provider.license) ? provider.license : {};
  const aircraft: GatewayAircraft[] = [];
  for (const item of body.aircraft) {
    const a = parseAircraft(item);
    if (a) aircraft.push(a);
  }
  return {
    provider: {
      id: str(provider.id) ?? '',
      name: str(provider.name) ?? '',
      url: str(provider.url) ?? '',
      attribution: str(provider.attribution) ?? '',
      license: {
        id: str(license.id) ?? '',
        name: str(license.name) ?? '',
        url: str(license.url) ?? '',
      },
    },
    area: {
      lat: num(area.lat) ?? 0,
      lon: num(area.lon) ?? 0,
      radiusNm: num(area.radiusNm) ?? 0,
    },
    providerTime: num(body.providerTime),
    fetchedAt,
    ttlS,
    aircraft,
  };
}

/** `Retry-After` in secondi o come data HTTP → ms. */
export function parseRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const t = value.trim();
  if (/^\d+$/.test(t)) return Number(t) * 1000;
  const date = Date.parse(t);
  return Number.isNaN(date) ? null : Math.max(0, date - nowMs);
}

export function buildAircraftUrl(lat: number, lon: number, radiusNm: number): string {
  const r = Math.max(1, Math.min(AIRCRAFT_MAX_RADIUS_NM, Math.round(radiusNm)));
  // Il gateway accetta al massimo 8 decimali, niente esponenziale.
  const fmt = (v: number) => Number(v.toFixed(4)).toString();
  return `${AIRCRAFT_GATEWAY_URL}?lat=${fmt(lat)}&lon=${fmt(lon)}&r=${r}`;
}

export async function fetchAircraftArea(
  area: { lat: number; lon: number; radiusNm: number },
  opts: { signal?: AbortSignal; fetchFn?: typeof fetch; now?: () => number } = {},
): Promise<GatewayResult> {
  const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  let res: Response;
  try {
    res = await fetchFn(buildAircraftUrl(area.lat, area.lon, area.radiusNm), {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
  } catch {
    return { kind: 'error', httpStatus: null, reason: 'network', retryAfterMs: null };
  }
  const retryAfterMs = parseRetryAfterMs(res.headers.get('Retry-After'), now());
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.status === 200) {
    const snapshot = parseGatewaySnapshot(body);
    if (snapshot) {
      const gatewayStale = res.headers.get('X-EarthRadar-Cache') === 'stale';
      return { kind: 'ok', snapshot, gatewayStale, retryAfterMs };
    }
    return { kind: 'error', httpStatus: 200, reason: 'invalid_payload', retryAfterMs };
  }
  const reason = isRec(body) ? (str(body.reason) ?? str(body.error) ?? 'http_error') : 'http_error';
  return { kind: 'error', httpStatus: res.status, reason, retryAfterMs };
}
