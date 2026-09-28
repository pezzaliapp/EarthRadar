/**
 * Registro delle fonti webcam del layer CAM.
 *
 * Unica fonte di verità per:
 *  - quali sorgenti esistono (solo enti pubblici, open data, keyless);
 *  - il TIPO di ogni fonte: LIVE (video reale) o SNAP (immagine periodica);
 *  - quali host ufficiali possono servire immagini, poster e stream
 *    (allowlist, solo HTTPS);
 *  - come si ricostruiscono gli URL a partire dai riferimenti del catalogo;
 *  - licenza e attribuzione richieste dalla fonte;
 *  - frequenza di refresh conservativa delle immagini.
 *
 * Il catalogo (`public/cam/cams-v2.json`) contiene solo riferimenti (id,
 * poster, stream): nessun URL arriva dal JSON. Un riferimento che non rispetta
 * il pattern della fonte non produce alcun URL.
 *
 * Aggiungere una fonte = aggiungere una voce qui + i suoi record nel catalogo:
 * CAM Explorer, mappa e globo non vanno modificati.
 */

export type CamSourceId = 'tfl' | 'digitraffic' | 'hktd' | 'caltrans' | 'iowa' | 'ingv' | 'cnrismar';

/** live = video reale (HLS) · snap = immagine aggiornata periodicamente. */
export type CamType = 'live' | 'snap';

interface Localized {
  it: string;
  en: string;
}

export interface CamSource {
  id: CamSourceId;
  /** Nome breve dell'ente/fonte (badge, card). */
  label: string;
  /** Area coperta. */
  region: Localized;
  type: CamType;
  /** Host ufficiali consentiti (immagini/poster/stream), con porta se non standard. */
  hosts: readonly string[];
  /** Host ammessi per pattern (es. server video numerati). */
  hostPatterns?: readonly RegExp[];
  /** Pattern dell'id: se non combacia, nessun URL viene costruito. */
  idPattern: RegExp;
  /** Pattern del riferimento poster (fonti LIVE con poster separato). */
  posterPattern?: RegExp;
  /**
   * URL dell'immagine (SNAP) o del poster (LIVE), da riferimenti già validati.
   * null = la fonte non ha un'immagine utilizzabile (segnaposto neutro).
   */
  imageUrl: (id: string, poster: string) => string | null;
  /** false = nessuna immagine/poster per questa fonte (default true). */
  hasImage?: boolean;
  /** Stream video (solo fonti LIVE). */
  stream?: {
    pattern: RegExp;
    url: (ref: string) => string;
  };
  /** Intervallo di refresh dell'immagine (card aperta + pagina visibile). */
  refreshMs: number;
  /** Frequenza di aggiornamento indicativa della fonte (testo). */
  updateEvery: Localized;
  licenseName: string;
  licenseUrl: string;
  /** Righe di attribuzione richieste dalla fonte, riportate testualmente. */
  attribution: readonly string[];
  /** Pagina ufficiale della fonte / del dataset. */
  homepageUrl: string;
}

/** UUID PeerTube: id e riferimento stream delle camere GARR.tv. */
const GARR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Fonti pubblicate su GARR.tv (PeerTube della rete GARR): id = stream = UUID,
 * HLS pubblico `garr.tv/static/streaming-playlists/hls/<uuid>/master.m3u8`.
 * Nessun poster: le anteprime PeerTube sono catture datate con un badge "LIVE"
 * impresso, che non devono mai sembrare una diretta.
 */
function garrSource(
  base: Pick<CamSource, 'id' | 'label' | 'region' | 'licenseName' | 'licenseUrl' | 'attribution' | 'homepageUrl'>,
): CamSource {
  return {
    ...base,
    type: 'live',
    hosts: ['garr.tv'],
    idPattern: GARR_UUID,
    imageUrl: () => null,
    hasImage: false,
    stream: {
      pattern: GARR_UUID,
      url: (uuid) => `https://garr.tv/static/streaming-playlists/hls/${uuid}/master.m3u8`,
    },
    refreshMs: 10 * 60_000,
    updateEvery: { it: 'video continuo', en: 'continuous video' },
  };
}

export const CAM_SOURCES: Readonly<Record<CamSourceId, CamSource>> = {
  tfl: {
    id: 'tfl',
    label: 'Transport for London — JamCams',
    region: { it: 'Londra, Regno Unito', en: 'London, United Kingdom' },
    type: 'snap',
    hosts: ['s3-eu-west-1.amazonaws.com'],
    idPattern: /^\d{5}\.\d{5}$/,
    imageUrl: (id) => `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${id}.jpg`,
    refreshMs: 3 * 60_000,
    updateEvery: { it: 'alcuni minuti', en: 'a few minutes' },
    licenseName: 'TfL Open Data (OGL v2)',
    licenseUrl: 'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service',
    attribution: [
      'Powered by TfL Open Data',
      'Contains OS data © Crown copyright and database rights 2016',
      'Geomni UK Map data © and database rights [2019]',
    ],
    homepageUrl: 'https://tfl.gov.uk/info-for/open-data-users/',
  },
  digitraffic: {
    id: 'digitraffic',
    label: 'Fintraffic — Digitraffic',
    region: { it: 'Finlandia', en: 'Finland' },
    type: 'snap',
    hosts: ['weathercam.digitraffic.fi'],
    idPattern: /^C\d{7}$/,
    imageUrl: (id) => `https://weathercam.digitraffic.fi/${id}.jpg`,
    refreshMs: 10 * 60_000,
    updateEvery: { it: '~10 minuti', en: '~10 minutes' },
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: [
      'Source: Fintraffic / digitraffic.fi, license CC 4.0 BY',
      'Station names normalised by EarthRadar (images unmodified)',
    ],
    homepageUrl: 'https://www.digitraffic.fi/en/road-traffic/',
  },
  hktd: {
    id: 'hktd',
    label: 'Transport Department, HKSAR Government',
    region: { it: 'Hong Kong', en: 'Hong Kong' },
    type: 'snap',
    hosts: ['tdcctv.data.one.gov.hk'],
    idPattern: /^[A-Z0-9]{2,16}$/,
    imageUrl: (id) => `https://tdcctv.data.one.gov.hk/${id}.JPG`,
    refreshMs: 2 * 60_000,
    updateEvery: { it: '~2 minuti', en: '~2 minutes' },
    licenseName: 'DATA.GOV.HK Terms and Conditions',
    licenseUrl: 'https://data.gov.hk/en/terms-and-conditions',
    attribution: [
      'Source: Transport Department, the Government of the HKSAR — DATA.GOV.HK',
      'Data © the Government of the Hong Kong Special Administrative Region',
    ],
    homepageUrl: 'https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images',
  },
  caltrans: {
    id: 'caltrans',
    label: 'Caltrans — California DOT',
    region: { it: 'California, USA', en: 'California, USA' },
    type: 'live',
    hosts: ['wzmedia.dot.ca.gov', 'cwwp2.dot.ca.gov'],
    // id = chiave immagine "d7/<nome>" (poster currentImageURL)
    idPattern: /^d\d{1,2}\/[a-z0-9_-]{1,80}$/i,
    imageUrl: (id) => {
      const [d, name] = id.split('/');
      return `https://cwwp2.dot.ca.gov/data/${d}/cctv/image/${name}/${name}.jpg`;
    },
    // stream = "D7/<nome>" (streamingVideoURL, Wowza HLS)
    stream: {
      pattern: /^D\d{1,2}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$/,
      url: (ref) => `https://wzmedia.dot.ca.gov/${ref}.stream/playlist.m3u8`,
    },
    refreshMs: 10 * 60_000,
    updateEvery: { it: 'video continuo', en: 'continuous video' },
    licenseName: 'Caltrans Conditions of Use (public domain unless otherwise indicated)',
    licenseUrl: 'https://dot.ca.gov/conditions-of-use',
    attribution: [
      'Video and images: Caltrans — California Department of Transportation',
      'Public domain unless otherwise indicated (dot.ca.gov/conditions-of-use)',
    ],
    homepageUrl: 'https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm',
  },
  iowa: {
    id: 'iowa',
    label: 'Iowa DOT — Iowa Department of Transportation',
    region: { it: 'Iowa, USA', en: 'Iowa, USA' },
    type: 'live',
    hosts: ['atmsqf.iowadot.gov'],
    hostPatterns: [/^video\d{1,2}\.iowadot\.gov:8888$/],
    // id = stream "<n>/<area>/<camera>" (VideoURL su videoN.iowadot.gov:8888)
    idPattern: /^\d{1,2}\/[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,60}$/i,
    posterPattern: /^snapshots\/public\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*){1,3}\.jpe?g$/i,
    imageUrl: (_id, poster) => `https://atmsqf.iowadot.gov/${poster}`,
    stream: {
      pattern: /^\d{1,2}\/[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,60}$/i,
      url: (ref) => {
        const [n, ...rest] = ref.split('/');
        return `https://video${n}.iowadot.gov:8888/${rest.join('/')}/playlist.m3u8`;
      },
    },
    refreshMs: 10 * 60_000,
    updateEvery: { it: 'video continuo', en: 'continuous video' },
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: [
      'Iowa Department of Transportation',
      'Traffic Cameras (including motion video URL) licensed under CC BY 4.0',
    ],
    homepageUrl: 'https://www.arcgis.com/home/item.html?id=c4063f200a7b4da5826e2ac86c677cf5',
  },
  ingv: garrSource({
    id: 'ingv',
    label: 'INGV – Osservatorio Etneo (via GARR.tv)',
    region: { it: 'Italia', en: 'Italy' },
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: [
      'INGV – Osservatorio Etneo, Istituto Nazionale di Geofisica e Vulcanologia',
      'Video via GARR.tv — licenza CC BY 4.0',
      "Etna: Pecora E., Prestifilippo M., Biale E., Principato P., Calvagna F., Ciancitto F., Sassano M. (2025). Etna's TV channel (EtnaTVChn). INGV. doi:10.13127/etna/tvchn",
      "Eolie: Pecora E., Prestifilippo M., Lodato L., Biale E., Principato P., Calvagna F., Ciancitto F., Sassano M. (2025). Aeolian's TV channel (AeolianTVChn). INGV. doi:10.13127/aeolian/tvchn",
    ],
    homepageUrl: 'https://www.ct.ingv.it/sezioniesterne/StreamingEtna.php',
  }),
  cnrismar: garrSource({
    id: 'cnrismar',
    label: 'CNR-ISMAR – Istituto di Scienze Marine (via GARR.tv)',
    region: { it: 'Italia', en: 'Italy' },
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: [
      'CNR-ISMAR – Istituto di Scienze Marine, Consiglio Nazionale delle Ricerche',
      'Video via GARR.tv — licenza CC BY 4.0 (come pubblicata su GARR.tv)',
    ],
    homepageUrl: 'https://www.ismar.cnr.it/web-content/piattaforma-acqua-alta/',
  }),
};

/** Colore dei marker CAM SNAP (2D e 3D): distinto da quakes/incendi/selezione. */
export const CAM_MARKER_COLOR = '#a78bfa';
/** Indicatore LIVE (piccolo punto rosso) su mappa, globo ed elenco. */
export const CAM_LIVE_COLOR = '#ff3b3b';

export const CAM_SOURCE_IDS = Object.keys(CAM_SOURCES) as CamSourceId[];

/** Host ufficiali consentiti (esatti, porta inclusa se non standard). */
export const CAM_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  ...CAM_SOURCE_IDS.flatMap((s) => CAM_SOURCES[s].hosts),
  ...CAM_SOURCE_IDS.flatMap((s) => [
    new URL(CAM_SOURCES[s].homepageUrl).host,
    new URL(CAM_SOURCES[s].licenseUrl).host,
  ]),
]);

const CAM_ALLOWED_HOST_PATTERNS: readonly RegExp[] = CAM_SOURCE_IDS.flatMap(
  (s) => CAM_SOURCES[s].hostPatterns ?? [],
);

export function isCamSourceId(v: unknown): v is CamSourceId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CAM_SOURCES, v);
}

export function isValidCamId(source: CamSourceId, id: unknown): id is string {
  return typeof id === 'string' && !id.includes('..') && CAM_SOURCES[source].idPattern.test(id);
}

/** True se la fonte fornisce immagini/poster (altrimenti segnaposto neutro). */
export function camHasImage(source: unknown): boolean {
  return isCamSourceId(source) && CAM_SOURCES[source].hasImage !== false;
}

export function isValidCamPoster(source: CamSourceId, poster: unknown): poster is string {
  const p = CAM_SOURCES[source].posterPattern;
  if (!p) return poster === undefined || poster === '';
  return typeof poster === 'string' && !poster.includes('..') && p.test(poster);
}

export function isValidCamStream(source: CamSourceId, stream: unknown): stream is string {
  const s = CAM_SOURCES[source].stream;
  return !!s && typeof stream === 'string' && !stream.includes('..') && s.pattern.test(stream);
}

/**
 * True solo per URL HTTPS verso un host in allowlist (esatto o per pattern),
 * senza credenziali. La porta è ammessa solo se fa parte dell'host consentito.
 */
export function isAllowedCamUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') return false;
  return CAM_ALLOWED_HOSTS.has(u.host) || CAM_ALLOWED_HOST_PATTERNS.some((p) => p.test(u.host));
}

/**
 * URL ufficiale dell'immagine (SNAP) o del poster (LIVE) di una camera, oppure
 * null se i riferimenti non sono validi. Costruito dal template, mai dal JSON.
 */
export function camImageUrl(source: unknown, id: unknown, poster: unknown = ''): string | null {
  if (!isCamSourceId(source) || !isValidCamId(source, id) || !isValidCamPoster(source, poster)) {
    return null;
  }
  const url = CAM_SOURCES[source].imageUrl(id, poster);
  return url && isAllowedCamUrl(url) ? url : null;
}

/**
 * URL dell'immagine con cache-buster a finestre di `refreshMs`: entro la stessa
 * finestra il browser riusa la risposta, alla successiva chiede l'immagine nuova.
 */
export function camSnapshotUrl(
  source: unknown,
  id: unknown,
  now = Date.now(),
  poster: unknown = '',
): string | null {
  const base = camImageUrl(source, id, poster);
  if (!base || !isCamSourceId(source)) return null;
  const bucket = Math.floor(now / CAM_SOURCES[source].refreshMs);
  return `${base}?t=${bucket}`;
}

/** URL dello stream video (solo fonti LIVE) oppure null. */
export function camStreamUrl(source: unknown, stream: unknown): string | null {
  if (!isCamSourceId(source) || !isValidCamStream(source, stream)) return null;
  const url = CAM_SOURCES[source].stream!.url(stream);
  return isAllowedCamUrl(url) ? url : null;
}
