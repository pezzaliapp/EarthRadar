// @ts-check
/**
 * camCatalogCore.mjs — logica pura (senza I/O) del catalogo CAM.
 *
 * Usata da `buildCamCatalog.mjs` e dai test. Per ogni fonte ufficiale:
 *  - valida ogni record (id, coordinate, nome, URL immagine ufficiale);
 *  - rifiuta coordinate impossibili o fuori dall'area della fonte;
 *  - elimina i duplicati;
 *  - normalizza e ordina in modo deterministico.
 *
 * Catalogo v2 (tuple, nessun URL):
 *   SNAP  [source, id, lat, lon, name, "S"]
 *   LIVE  [source, id, lat, lon, name, "L", streamRef, posterRef]
 * Gli URL (immagine, poster, stream HLS) si ricostruiscono a runtime da
 * source + riferimenti validati (vedi src/services/camSources.ts, stessi
 * pattern e template, verificati da test).
 */

import { createHash } from 'node:crypto';

export const CATALOG_VERSION = 2;

/**
 * @typedef {'tfl' | 'digitraffic' | 'hktd' | 'caltrans' | 'iowa' | 'ingv' | 'cnrismar'} SourceId
 * @typedef {'S' | 'L'} CamKind
 * @typedef {Array<string | number>} CamTuple
 * @typedef {{ source: SourceId, id: string, lat: number, lon: number, name: string, kind: CamKind, stream?: string, poster?: string }} CamRecord
 * @typedef {{ accepted: CamRecord[], rejected: Record<string, number>, total: number }} NormalizeResult
 */

// ─── GARR.tv ─────────────────────────────────────────────────────────────

/** UUID PeerTube (id e riferimento stream delle camere GARR.tv). */
export const GARR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** URL HLS pubblico di un video/live GARR.tv. */
export const garrStreamUrl = (/** @type {string} */ uuid) =>
  `https://garr.tv/static/streaming-playlists/hls/${uuid}/master.m3u8`;

/**
 * Regola comune per le fonti pubblicate su GARR.tv: id = stream = UUID.
 * Fonti facoltative: se offline alla build escono dal catalogo, senza errori.
 * @param {[number, number, number, number]} bbox
 * @returns {SourceRule}
 */
export function garrRule(bbox) {
  return {
    kind: 'L',
    idPattern: GARR_UUID,
    bbox,
    minCount: 0,
    optional: true,
    streamPattern: GARR_UUID,
    streamUrl: garrStreamUrl,
  };
}

/**
 * Camere GARR.tv ammesse (audit CAM-LIVE-EUROPE-AUDIT-R1). PeerTube non espone
 * coordinate: posizione e nome sono curati qui; `channel` è il canale atteso
 * (verificato alla build insieme a licenza, visibilità e stato live).
 * @type {Array<{ source: SourceId, uuid: string, channel: string, name: string, lat: number, lon: number }>}
 */
export const GARR_STREAMS = [
  {
    source: 'ingv',
    uuid: 'c6c70a03-e711-4eed-9835-1d02f5a5ec58',
    channel: 'ingv_catania',
    name: 'Etna — INGV TV (crateri sommitali), Sicilia',
    lat: 37.751,
    lon: 14.994,
  },
  {
    source: 'ingv',
    uuid: '8790a7a8-211c-4794-bcb2-41e24cd2e322',
    channel: 'ingv_catania',
    name: 'Eolie — INGV TV (Vulcano e Stromboli)',
    lat: 38.404,
    lon: 14.962,
  },
  {
    source: 'cnrismar',
    uuid: '683360e8-c738-4527-a22b-d1e01c3d522b',
    channel: 'aaot_cnr_ismar_channel_1',
    name: 'Piattaforma Acqua Alta — camera subacquea −6 m, Golfo di Venezia',
    lat: 45.31425,
    lon: 12.50825,
  },
  {
    source: 'cnrismar',
    uuid: '4e96b57f-6b1e-4aa9-8d69-23eb791a78b2',
    channel: 'aaot_cnr_ismar_channel_2',
    name: 'Piattaforma Acqua Alta — vista Sud, Golfo di Venezia',
    lat: 45.31425,
    lon: 12.50825,
  },
  {
    source: 'cnrismar',
    uuid: 'a4c8fcd5-2eeb-483b-bcda-9568331f33c8',
    channel: 'aaot_cnr_ismar_channel_3',
    name: 'Venezia — Riva dei Sette Martiri (Palazzina Canonica, vista Ovest)',
    lat: 45.4323,
    lon: 12.3522,
  },
  {
    source: 'cnrismar',
    uuid: '018998c7-c166-4f6d-b5a6-77517aea0834',
    channel: 'aaot_cnr_ismar_channel_4',
    name: 'Piattaforma Acqua Alta — vista Ovest, Golfo di Venezia',
    lat: 45.31425,
    lon: 12.50825,
  },
];

/**
 * Candidati GARR.tv di una fonte, dai metadati pubblici PeerTube
 * (`GET https://garr.tv/api/v1/videos/<uuid>`). Entra solo un video che è:
 * live in questo momento, pubblico, CC BY 4.0, sul canale atteso, su garr.tv.
 * La disponibilità reale del flusso HLS è verificata a parte (`verifyHlsLive`).
 * @param {SourceId} source
 * @param {typeof GARR_STREAMS} seeds
 * @param {Record<string, any>} apiByUuid risposta API per UUID (assente = errore)
 */
export function candidatesFromGarr(source, seeds, apiByUuid) {
  return seeds
    .filter((s) => s.source === source)
    .map((s) => {
      const v = apiByUuid[s.uuid];
      if (!v) return { skip: 'api_unavailable' };
      if (v.isLive !== true) return { skip: 'not_live' };
      if (v.privacy?.label !== 'Public') return { skip: 'not_public' };
      if (v.licence?.label !== 'CC BY 4.0') return { skip: 'licence_mismatch' };
      if (v.channel?.name !== s.channel || v.channel?.host !== 'garr.tv') return { skip: 'channel_mismatch' };
      return { id: s.uuid, lat: s.lat, lon: s.lon, name: s.name, stream: s.uuid, poster: '' };
    });
}

/**
 * Verifica che un flusso HLS sia davvero in diretta: master valido, playlist
 * media valida, ultimo segmento scaricabile, sequenza che avanza nel tempo.
 * Solo playlist e primi byte di un segmento (mai video completo).
 * @param {string} masterUrl
 * @param {{ fetchImpl?: typeof fetch, waitMs?: number, sleep?: (ms: number) => Promise<void>, headers?: Record<string, string> }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyHlsLive(masterUrl, opts = {}) {
  const f = opts.fetchImpl ?? fetch;
  const headers = opts.headers ?? {};
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const text = async (/** @type {string} */ u) => {
    const r = await f(u, { headers, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    return { ok: r.ok, body: r.ok ? await r.text() : '' };
  };
  const seqOf = (/** @type {string} */ t) => Number((/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(t) ?? [])[1] ?? NaN);
  const segmentsOf = (/** @type {string} */ t) => t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  try {
    const master = await text(masterUrl);
    if (!master.ok || !master.body.startsWith('#EXTM3U')) return { ok: false, reason: 'master' };
    let mediaUrl = masterUrl;
    let media = master;
    if (master.body.includes('#EXT-X-STREAM-INF')) {
      const first = segmentsOf(master.body)[0];
      if (!first) return { ok: false, reason: 'master' };
      mediaUrl = new URL(first, masterUrl).href;
      media = await text(mediaUrl);
    }
    if (!media.ok || !media.body.startsWith('#EXTM3U') || media.body.includes('#EXT-X-ENDLIST')) {
      return { ok: false, reason: 'media' };
    }
    const segs = segmentsOf(media.body);
    if (segs.length === 0) return { ok: false, reason: 'no_segments' };
    const seg = await f(new URL(segs[segs.length - 1], mediaUrl).href, {
      headers: { ...headers, Range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!(seg.status === 200 || seg.status === 206)) return { ok: false, reason: 'segment' };
    await seg.arrayBuffer?.();
    const before = seqOf(media.body);
    await sleep(opts.waitMs ?? 12_000);
    const after = await text(mediaUrl);
    if (!after.ok) return { ok: false, reason: 'media' };
    const next = seqOf(after.body);
    const advanced = next > before || segmentsOf(after.body).at(-1) !== segs[segs.length - 1];
    return advanced ? { ok: true } : { ok: false, reason: 'stalled' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Stessi pattern/template di src/services/camSources.ts (verificato da test).
 * `bbox` = [minLat, minLon, maxLat, maxLon]: area plausibile della fonte.
 * Fonti SNAP: `imageUrl(id)`. Fonti LIVE: `streamUrl(ref)` + `posterUrl(id, ref)`.
 * @typedef {{ kind: CamKind, idPattern: RegExp, bbox: [number, number, number, number], minCount: number,
 *   optional?: boolean,
 *   imageUrl?: (id: string) => string,
 *   streamPattern?: RegExp, streamUrl?: (ref: string) => string,
 *   posterPattern?: RegExp, posterUrl?: (id: string, ref: string) => string }} SourceRule
 * @type {Record<SourceId, SourceRule>}
 */
export const SOURCE_RULES = {
  tfl: {
    kind: 'S',
    idPattern: /^\d{5}\.\d{5}$/,
    imageUrl: (id) => `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${id}.jpg`,
    bbox: [51.2, -0.6, 51.8, 0.4],
    minCount: 100,
  },
  digitraffic: {
    kind: 'S',
    idPattern: /^C\d{7}$/,
    imageUrl: (id) => `https://weathercam.digitraffic.fi/${id}.jpg`,
    bbox: [59.5, 19.0, 70.2, 31.7],
    minCount: 100,
  },
  hktd: {
    kind: 'S',
    idPattern: /^[A-Z0-9]{2,16}$/,
    imageUrl: (id) => `https://tdcctv.data.one.gov.hk/${id}.JPG`,
    bbox: [22.1, 113.8, 22.6, 114.5],
    minCount: 100,
  },
  // Caltrans: id = chiave dell'immagine "d7/<nome>" (poster), stream = "D7/<nome>" (Wowza).
  caltrans: {
    kind: 'L',
    idPattern: /^d\d{1,2}\/[a-z0-9_-]{1,80}$/i,
    bbox: [32.3, -124.6, 42.1, -114.0],
    minCount: 500,
    streamPattern: /^D\d{1,2}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/,
    streamUrl: (ref) => `https://wzmedia.dot.ca.gov/${ref}.stream/playlist.m3u8`,
    posterUrl: (id) => {
      const [d, name] = id.split('/');
      return `https://cwwp2.dot.ca.gov/data/${d}/cctv/image/${name}/${name}.jpg`;
    },
  },
  // Iowa DOT: id = stream "<n>/<area>/<camera>" (videoN.iowadot.gov:8888), poster su atmsqf.
  iowa: {
    kind: 'L',
    idPattern: /^\d{1,2}\/[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,60}$/i,
    bbox: [40.3, -96.7, 43.6, -90.1],
    minCount: 200,
    streamPattern: /^\d{1,2}\/[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,60}$/i,
    streamUrl: (ref) => {
      const [n, ...rest] = ref.split('/');
      return `https://video${n}.iowadot.gov:8888/${rest.join('/')}/playlist.m3u8`;
    },
    posterPattern: /^snapshots\/public\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*){1,3}\.jpe?g$/i,
    posterUrl: (_id, ref) => `https://atmsqf.iowadot.gov/${ref}`,
  },
  // GARR.tv (PeerTube della rete GARR): enti pubblici di ricerca, CC BY 4.0.
  ingv: garrRule([37.0, 14.0, 39.2, 16.0]),
  cnrismar: garrRule([45.0, 12.0, 45.8, 12.8]),
};

export const SOURCE_ORDER = /** @type {SourceId[]} */ ([
  'tfl',
  'digitraffic',
  'hktd',
  'caltrans',
  'iowa',
  'ingv',
  'cnrismar',
]);

const MAX_NAME = 100;

/**
 * Nome leggibile: niente caratteri di controllo, spazi compattati, lunghezza limitata.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  const clean = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1).trimEnd()}…` : clean;
}

/**
 * @param {unknown} v
 * @returns {number}
 */
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/** Arrotonda a 5 decimali (~1 m): sufficiente e stabile nel JSON. */
function round5(/** @type {number} */ v) {
  return Math.round(v * 1e5) / 1e5;
}

/**
 * Valida un candidato. Ritorna il record normalizzato oppure il motivo del rifiuto.
 * Per le fonti LIVE: `streamUrl`/`posterUrl` originali devono coincidere
 * esattamente con quelli ricostruiti dai riferimenti (nessun URL arbitrario).
 * @param {SourceId} source
 * @param {{ id: unknown, lat: unknown, lon: unknown, name: unknown, imageUrl?: unknown, stream?: unknown, streamUrl?: unknown, poster?: unknown, posterUrl?: unknown }} c
 * @returns {{ ok: true, record: CamRecord } | { ok: false, reason: string }}
 */
export function validateCandidate(source, c) {
  const rules = SOURCE_RULES[source];
  if (typeof c.id !== 'string' || c.id === '') return { ok: false, reason: 'missing_id' };
  if (!rules.idPattern.test(c.id)) return { ok: false, reason: 'invalid_id' };
  const lat = toNumber(c.lat);
  const lon = toNumber(c.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, reason: 'invalid_coords' };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, reason: 'invalid_coords' };
  if (lat === 0 && lon === 0) return { ok: false, reason: 'invalid_coords' };
  const [minLat, minLon, maxLat, maxLon] = rules.bbox;
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
    return { ok: false, reason: 'outside_source_area' };
  }
  const name = normalizeName(c.name);
  if (name === '') return { ok: false, reason: 'missing_name' };
  // Se la fonte dichiara l'URL immagine, deve coincidere col template ufficiale:
  // garantisce che l'URL ricostruito a runtime sia esattamente quello dell'ente.
  if (rules.kind === 'S') {
    if (c.imageUrl !== undefined && rules.imageUrl && c.imageUrl !== rules.imageUrl(c.id)) {
      return { ok: false, reason: 'unexpected_image_url' };
    }
    return { ok: true, record: { source, id: c.id, lat: round5(lat), lon: round5(lon), name, kind: 'S' } };
  }
  // LIVE
  const stream = typeof c.stream === 'string' ? c.stream : '';
  const poster = typeof c.poster === 'string' ? c.poster : '';
  if (!stream || !rules.streamPattern?.test(stream) || stream.includes('..')) {
    return { ok: false, reason: 'invalid_stream' };
  }
  if (c.streamUrl !== undefined && c.streamUrl !== rules.streamUrl?.(stream)) {
    return { ok: false, reason: 'unexpected_stream_url' };
  }
  if (rules.posterPattern && (!rules.posterPattern.test(poster) || poster.includes('..'))) {
    return { ok: false, reason: 'invalid_poster' };
  }
  if (c.posterUrl !== undefined && c.posterUrl !== rules.posterUrl?.(c.id, poster)) {
    return { ok: false, reason: 'unexpected_poster_url' };
  }
  return {
    ok: true,
    record: { source, id: c.id, lat: round5(lat), lon: round5(lon), name, kind: 'L', stream, poster },
  };
}

/**
 * Valida, deduplica (per source+id) e ordina i candidati di una fonte.
 * @param {SourceId} source
 * @param {Array<{ id: unknown, lat: unknown, lon: unknown, name: unknown, imageUrl?: unknown } | { skip: string }>} candidates
 * @returns {NormalizeResult}
 */
export function normalizeCandidates(source, candidates) {
  /** @type {Record<string, number>} */
  const rejected = {};
  /** @type {Map<string, CamRecord>} */
  const byId = new Map();
  const bump = (/** @type {string} */ r) => {
    rejected[r] = (rejected[r] ?? 0) + 1;
  };
  for (const c of candidates) {
    if ('skip' in c) {
      bump(c.skip);
      continue;
    }
    const v = validateCandidate(source, c);
    if (!v.ok) {
      bump(v.reason);
      continue;
    }
    if (byId.has(v.record.id)) {
      bump('duplicate');
      continue;
    }
    byId.set(v.record.id, v.record);
  }
  const accepted = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { accepted, rejected, total: candidates.length };
}

// ─── Adattatori per fonte ────────────────────────────────────────────────

/**
 * TfL JamCams — `api.tfl.gov.uk/Place/Type/JamCam`. Solo camere `available`.
 * @param {unknown} json
 */
export function candidatesFromTfl(json) {
  if (!Array.isArray(json)) throw new Error('tfl: risposta non è un array');
  return json.map((p) => {
    /** @type {Record<string, string>} */
    const props = {};
    for (const ap of Array.isArray(p?.additionalProperties) ? p.additionalProperties : []) {
      if (typeof ap?.key === 'string' && typeof ap?.value === 'string') props[ap.key] = ap.value;
    }
    if (props.available !== 'true') return { skip: 'not_available' };
    const rawId = typeof p?.id === 'string' ? p.id : '';
    const id = rawId.startsWith('JamCams_') ? rawId.slice('JamCams_'.length) : rawId;
    return { id, lat: p?.lat, lon: p?.lon, name: p?.commonName, imageUrl: props.imageUrl };
  });
}

/**
 * Nome stazione Digitraffic: "vt4_Helsinki_Tattarisuo" → "vt4 Helsinki Tattarisuo".
 * @param {unknown} raw
 */
export function digitrafficName(raw) {
  return normalizeName(typeof raw === 'string' ? raw.replace(/_/g, ' ') : raw);
}

/**
 * Digitraffic weathercam — GeoJSON delle stazioni. Una camera per stazione
 * attiva (`GATHERING`), sul primo preset in raccolta. Stazioni di test escluse.
 * @param {unknown} json
 */
export function candidatesFromDigitraffic(json) {
  const features = /** @type {any} */ (json)?.features;
  if (!Array.isArray(features)) throw new Error('digitraffic: GeoJSON senza features');
  return features.map((f) => {
    const p = f?.properties ?? {};
    if (p.collectionStatus !== 'GATHERING') return { skip: 'not_gathering' };
    if (typeof p.name === 'string' && /^\s*test[_\s]/i.test(p.name)) return { skip: 'test_station' };
    const presets = Array.isArray(p.presets) ? p.presets : [];
    const preset = presets.find((x) => x?.inCollection === true && typeof x?.id === 'string');
    if (!preset) return { skip: 'no_active_preset' };
    const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
    return { id: preset.id, lat: coords[1], lon: coords[0], name: digitrafficName(p.name) };
  });
}

/** @param {string} s */
function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * Hong Kong TD — XML `Traffic_Camera_Locations_En.xml` (struttura piatta,
 * parser minimale senza dipendenze). La descrizione termina con "[KEY]": rimosso.
 * @param {string} xml
 */
export function candidatesFromHktd(xml) {
  if (typeof xml !== 'string' || !xml.includes('<image-list')) {
    throw new Error('hktd: XML inatteso');
  }
  const out = [];
  for (const m of xml.matchAll(/<image>([\s\S]*?)<\/image>/g)) {
    const block = m[1];
    const field = (/** @type {string} */ tag) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      return r ? decodeXmlEntities(r[1].trim()) : undefined;
    };
    const id = field('key') ?? '';
    const description = (field('description') ?? '').replace(/\s*\[[^\]]*\]\s*$/, '');
    out.push({
      id,
      lat: field('latitude'),
      lon: field('longitude'),
      name: description,
      imageUrl: field('url'),
    });
  }
  return out;
}

/**
 * URL canonico (porta di default rimossa, es. ":443"), oppure '' se non valido.
 * @param {unknown} raw
 */
function canonicalUrl(raw) {
  if (typeof raw !== 'string') return '';
  try {
    return new URL(raw).href;
  } catch {
    return '';
  }
}

/**
 * Caltrans CCTV — `cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json` (un file
 * per distretto). Solo camere in servizio con `streamingVideoURL` (video HLS),
 * distinto da `currentImageURL` (JPEG, usato come poster). La disponibilità
 * reale dello stream è verificata a parte (vedi buildCamCatalog.mjs).
 * @param {unknown} json
 */
export function candidatesFromCaltrans(json) {
  const data = /** @type {any} */ (json)?.data;
  if (!Array.isArray(data)) throw new Error('caltrans: JSON senza data[]');
  return data.map((r) => {
    const c = r?.cctv ?? {};
    if (c.inService !== 'true') return { skip: 'not_in_service' };
    const streamUrl = canonicalUrl(c.imageData?.streamingVideoURL);
    const m = /^https:\/\/wzmedia\.dot\.ca\.gov\/(.+)\.stream\/playlist\.m3u8$/.exec(streamUrl);
    if (!m) return { skip: 'no_stream' };
    const posterUrl = canonicalUrl(c.imageData?.static?.currentImageURL);
    const p = /^https:\/\/cwwp2\.dot\.ca\.gov\/data\/(d\d{1,2})\/cctv\/image\/([^/]+)\/\2\.jpg$/i.exec(posterUrl);
    if (!p) return { skip: 'no_poster' };
    const loc = c.location ?? {};
    const place = typeof loc.nearbyPlace === 'string' ? loc.nearbyPlace.trim() : '';
    const base = typeof loc.locationName === 'string' ? loc.locationName : '';
    const name = place && !base.toLowerCase().includes(place.toLowerCase()) ? `${base} — ${place}` : base;
    return {
      id: `${p[1]}/${p[2]}`,
      lat: loc.latitude,
      lon: loc.longitude,
      name,
      stream: decodeURIComponent(m[1]),
      streamUrl,
      poster: '',
      posterUrl,
    };
  });
}

/**
 * Iowa DOT — ArcGIS FeatureServer `Traffic_Cameras_View` (CC BY 4.0, include il
 * "motion video URL"). Solo camere con `VideoURL` HLS; poster = `ImageURL`.
 * @param {unknown} json
 */
export function candidatesFromIowa(json) {
  const features = /** @type {any} */ (json)?.features;
  if (!Array.isArray(features)) throw new Error('iowa: risposta ArcGIS senza features');
  return features.map((f) => {
    const a = f?.attributes ?? {};
    const streamUrl = canonicalUrl(a.VideoURL);
    const m = /^https:\/\/video(\d{1,2})\.iowadot\.gov:8888\/(.+)\/playlist\.m3u8$/.exec(streamUrl);
    if (!m) return { skip: 'no_stream' };
    const posterUrl = canonicalUrl(a.ImageURL);
    const p = /^https:\/\/atmsqf\.iowadot\.gov\/(.+)$/.exec(posterUrl);
    const stream = `${m[1]}/${m[2]}`;
    const desc = typeof a.Desc_ === 'string' ? a.Desc_ : '';
    const region = typeof a.REGION === 'string' ? a.REGION.trim() : '';
    const name =
      region && region.length <= 40 && !desc.toLowerCase().includes(region.toLowerCase())
        ? `${desc} — ${region}`
        : desc;
    return {
      id: stream,
      lat: a.latitude,
      lon: a.longitude,
      name,
      stream,
      streamUrl,
      poster: p ? p[1] : '',
      posterUrl,
    };
  });
}

// ─── Serializzazione deterministica ──────────────────────────────────────

/**
 * Costruisce il catalogo. Output deterministico: stesso input → stessi byte
 * (nessun timestamp; `hash` = sha256 delle camere).
 * @param {Partial<Record<SourceId, CamRecord[]>>} bySource
 * @returns {string}
 */
export function serializeCatalog(bySource) {
  /** @type {CamTuple[]} */
  const cams = [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const source of SOURCE_ORDER) {
    const records = bySource[source];
    if (!records) continue;
    counts[source] = records.length;
    for (const r of records) {
      cams.push(
        r.kind === 'L'
          ? [r.source, r.id, r.lat, r.lon, r.name, 'L', r.stream ?? '', r.poster ?? '']
          : [r.source, r.id, r.lat, r.lon, r.name, 'S'],
      );
    }
  }
  const body = cams.map((c) => JSON.stringify(c)).join(',\n');
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  return (
    `{"v":${CATALOG_VERSION},"hash":"${hash}","counts":${JSON.stringify(counts)},"cams":[\n` +
    `${body}\n]}\n`
  );
}

/**
 * Metadati minimi del catalogo (conteggi), inclusi nel bundle per la callout
 * della Home: mostrano il totale senza scaricare il catalogo con CAM OFF.
 * @param {string} catalogText testo prodotto da `serializeCatalog`
 * @returns {string}
 */
export function serializeMeta(catalogText) {
  const parsed = JSON.parse(catalogText);
  const cams = Array.isArray(parsed.cams) ? parsed.cams : [];
  const kinds = {
    live: cams.filter((c) => c[5] === 'L').length,
    snap: cams.filter((c) => c[5] !== 'L').length,
  };
  return `${JSON.stringify({ v: parsed.v, hash: parsed.hash, total: cams.length, kinds, counts: parsed.counts }, null, 2)}\n`;
}

/**
 * Record di un catalogo già pubblicato (v1 o v2), per riusare le fonti non
 * rigenerate (`--only`). Le tuple v1 `[s,id,lat,lon,name]` sono SNAP.
 * @param {string} text
 * @returns {Partial<Record<SourceId, CamRecord[]>>}
 */
export function recordsFromCatalog(text) {
  const parsed = JSON.parse(text);
  /** @type {Partial<Record<SourceId, CamRecord[]>>} */
  const out = {};
  for (const t of Array.isArray(parsed.cams) ? parsed.cams : []) {
    const [source, id, lat, lon, name, kind, stream, poster] = t;
    if (!SOURCE_ORDER.includes(source)) continue;
    /** @type {CamRecord} */
    const rec =
      kind === 'L'
        ? { source, id, lat, lon, name, kind: 'L', stream, poster }
        : { source, id, lat, lon, name, kind: 'S' };
    (out[/** @type {SourceId} */ (source)] ??= []).push(rec);
  }
  return out;
}
