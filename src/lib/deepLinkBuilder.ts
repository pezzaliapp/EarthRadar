/**
 * Deep link bidirezionali tra EarthRadar e le sister app PezzaliAPP.
 *
 * Schemi (allineati con CLAUDE.md decisione 9):
 *   EarthRadar → MeteorWatch  : ?event=<type>&id=<id>          (type: neo|fireball|reentry|iss)
 *   EarthRadar → CubeSat      : ?tle=<base64TLE>&name=<name>
 *   ──────────────────────────────────────────────────────────────
 *   MeteorWatch → EarthRadar  : ?lat=<n>&lon=<n>&zoom=<n>&layer=<id>
 *   CubeSat → EarthRadar      : ?norad=<id>&layer=satellites
 *   EarthRadar self-share     : ?lat=<n>&lon=<n>&zoom=<n>&view=2d|3d&layers=<csv>
 */

const METEORWATCH_BASE = 'https://www.alessandropezzali.it/MeteorWatch/';
const CUBESAT_BASE = 'https://www.alessandropezzali.it/CubeSat_Constellation/';
export const EARTHRADAR_BASE = 'https://www.alessandropezzali.it/EarthRadar/';

export type MeteorWatchEventType = 'neo' | 'fireball' | 'reentry' | 'iss';

export interface TleSet {
  name: string;
  line1: string;
  line2: string;
}

function toBase64Utf8(input: string): string {
  if (typeof window === 'undefined') {
    const g = globalThis as unknown as {
      Buffer?: { from(s: string, enc: string): { toString(enc: string): string } };
    };
    if (g.Buffer) return g.Buffer.from(input, 'utf-8').toString('base64');
  }
  return window.btoa(unescape(encodeURIComponent(input)));
}

// ─── Outbound: EarthRadar → sister apps ────────────────────────────────────

export function meteorWatchEventLink(type: MeteorWatchEventType, id?: string): string {
  const params = new URLSearchParams({ event: type });
  if (id) params.set('id', id);
  return `${METEORWATCH_BASE}?${params.toString()}`;
}

/**
 * Object-signature alias di {@link meteorWatchEventLink}. La firma è quella
 * richiesta dalla Fase 4 dell'architettura: i call site nuovi (ShareButton +
 * DetailPanel) la trovano più leggibile, gli storici ricicleranno il legacy.
 */
export function eventToMeteorWatchUrl(input: {
  type: MeteorWatchEventType;
  id?: string;
}): string {
  return meteorWatchEventLink(input.type, input.id);
}

export function meteorWatchHomeLink(): string {
  return METEORWATCH_BASE;
}

export function cubeSatTleLink(tle: TleSet): string {
  const text = `${tle.name}\n${tle.line1}\n${tle.line2}`;
  const encoded = toBase64Utf8(text);
  const params = new URLSearchParams({ tle: encoded, name: tle.name });
  return `${CUBESAT_BASE}?${params.toString()}`;
}

export function cubeSatHomeLink(): string {
  return CUBESAT_BASE;
}

// ─── Self-share: EarthRadar → EarthRadar ──────────────────────────────────

/**
 * Lista esplicita delle layer id che accettiamo dai deep link entranti.
 * Hardcoded qui (invece che import da layersStore) per evitare cicli di
 * dipendenza tra `lib/` e `store/`. Va aggiornata se nascono nuovi layer.
 */
export const SHAREABLE_LAYER_IDS = [
  'quakes',
  'satellites',
  'aircraft',
  'weather',
  'firms',
  'eonet',
  'iss',
  'lightning',
  'rainviewer',
  'terminator',
  'gibs_temperature',
  'gibs_aerosol',
  'gibs_fires',
  'gibs_snow',
  'gibs_seaice',
  'gibs_clouds_geocolor',
] as const;

export type ShareableLayerId = (typeof SHAREABLE_LAYER_IDS)[number];

export interface ShareMapState {
  lat: number;
  lon: number;
  zoom?: number;
  view?: '2d' | '3d';
  /** Lista di layer id ATTIVI da forzare al ricevitore. */
  activeLayers?: readonly ShareableLayerId[];
}

/**
 * Costruisce un URL EarthRadar autocontenuto che riapre la mappa esattamente
 * com'era. Usato da ShareButton per copiare/condividere lo stato corrente.
 */
export function mapStateToShareUrl(state: ShareMapState): string {
  const params = new URLSearchParams();
  params.set('lat', state.lat.toFixed(4));
  params.set('lon', state.lon.toFixed(4));
  if (state.zoom !== undefined) params.set('zoom', String(Math.round(state.zoom)));
  if (state.view) params.set('view', state.view);
  if (state.activeLayers && state.activeLayers.length > 0) {
    params.set('layers', [...state.activeLayers].join(','));
  }
  return `${EARTHRADAR_BASE}?${params.toString()}`;
}

// ─── Inbound: sister apps / self-share → EarthRadar ───────────────────────

export interface IncomingDeepLink {
  /** Centro mappa: presente solo se entrambi lat e lon sono validi. */
  center?: { lat: number; lon: number };
  zoom?: number;
  view?: '2d' | '3d';
  /** Layer da attivare. Già filtrati: solo id valide. */
  activeLayers?: ShareableLayerId[];
  /** Singolo layer da focalizzare (compat MeteorWatch ?layer=...). */
  focusLayer?: ShareableLayerId;
  /** NORAD catalog number (intero positivo). Compat CubeSat ?norad=...). */
  norad?: number;
  /** Event id MeteorWatch (passa l'event in URL ?event=...&id=...). */
  meteorEventId?: string;
  meteorEventType?: MeteorWatchEventType;
}

function parseFloatStrict(s: string | null, range: [number, number]): number | undefined {
  if (s === null) return undefined;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  if (n < range[0] || n > range[1]) return undefined;
  return n;
}

function parseIntStrict(s: string | null, range: [number, number]): number | undefined {
  if (s === null) return undefined;
  const n = Number.parseInt(s, 10);
  if (!Number.isInteger(n)) return undefined;
  if (n < range[0] || n > range[1]) return undefined;
  return n;
}

const SHAREABLE_SET = new Set<string>(SHAREABLE_LAYER_IDS);
const METEOR_TYPES = new Set<string>(['neo', 'fireball', 'reentry', 'iss']);

/**
 * Parser robusto di una query-string entrante. Tutte le chiavi sono opzionali:
 * il chiamante applica solo i campi presenti.
 *
 * Accetta input come:
 *   ?lat=44.698&lon=10.631&zoom=5&view=3d&layers=quakes,iss
 *   ?norad=25544&layer=satellites
 *   ?event=neo&id=2025AB1
 */
export function parseIncomingShareUrl(search: string | URLSearchParams): IncomingDeepLink {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out: IncomingDeepLink = {};

  const lat = parseFloatStrict(params.get('lat'), [-90, 90]);
  const lon = parseFloatStrict(params.get('lon'), [-180, 180]);
  if (lat !== undefined && lon !== undefined) {
    out.center = { lat, lon };
  }

  const zoom = parseIntStrict(params.get('zoom'), [1, 18]);
  if (zoom !== undefined) out.zoom = zoom;

  const view = params.get('view');
  if (view === '2d' || view === '3d') out.view = view;

  const layers = params.get('layers');
  if (layers) {
    const ids = layers
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ShareableLayerId => SHAREABLE_SET.has(s));
    if (ids.length > 0) out.activeLayers = ids;
  }

  const focusLayer = params.get('layer');
  if (focusLayer && SHAREABLE_SET.has(focusLayer)) {
    out.focusLayer = focusLayer as ShareableLayerId;
  }

  const norad = parseIntStrict(params.get('norad'), [1, 9_999_999]);
  if (norad !== undefined) out.norad = norad;

  const eventType = params.get('event');
  const eventId = params.get('id');
  if (eventType && METEOR_TYPES.has(eventType)) {
    out.meteorEventType = eventType as MeteorWatchEventType;
    if (eventId) out.meteorEventId = eventId;
  }

  return out;
}
