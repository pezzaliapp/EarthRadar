/**
 * NASA GIBS WMTS REST tile templates (no API key needed).
 *
 * Documentazione: https://nasa-gibs.github.io/gibs-api-docs/
 *
 * Decisione 1 delle "Chiarificazioni post-review iniziale":
 *   - layer giornalieri → publicano con ~1 giorno di delay → si usa `date - 1 day`.
 *   - layer real-time (GOES GeoColor, GOES-GLM) → NO shift, si usa timestamp arrotondato.
 *   - layer statici (Black Marble 2016) → `staticDate` fissa.
 *
 * Categoria:
 *   - `base`     : tile sostitutivi del fondo mappa (mutuamente esclusivi).
 *   - `overlay`  : tile parzialmente trasparenti, stackabili sopra altri layer.
 */

export type GibsCategory = 'base' | 'overlay';

export interface GibsLayer {
  id: string;
  name: { it: string; en: string };
  description: { it: string; en: string };
  /** URL template con `{date}` come placeholder. */
  url: string;
  attribution: string;
  /** Max zoom raggiungibile dal server. */
  maxZoom: number;
  matrixSet: string;
  format: 'jpg' | 'png';
  category: GibsCategory;
  /** Se `true` il timestamp viene formattato come ISO sub-giornaliero (real-time). */
  isRealTime?: boolean;
  /** Se impostato, il template usa **sempre** questa data invece di calcolarla. */
  staticDate?: string;
  /** Granularità di arrotondamento per layer real-time, in minuti. Default 10. */
  realTimeStepMin?: number;
  /** Buffer di sicurezza in minuti dal "now" per layer real-time (per coprire latenza pubblicazione). Default 15. */
  realTimeLagMin?: number;
}

const TIME = '{date}';
const GIBS_ATTR =
  '<a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</a>';

export const GIBS_LAYERS: GibsLayer[] = [
  // --- BASE LAYERS (mutuamente esclusivi) ---
  {
    id: 'gibs_modis_truecolor',
    name: { it: 'MODIS Terra (vero colore)', en: 'MODIS Terra (true color)' },
    description: {
      it: 'Vero colore diurno, sensore MODIS sul satellite Terra. Aggiornato 1×/giorno.',
      en: 'Daytime true color from the MODIS sensor on Terra. Updated once a day.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    attribution: GIBS_ATTR,
    maxZoom: 9,
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    category: 'base',
  },
  {
    id: 'gibs_viirs_truecolor',
    name: { it: 'VIIRS Suomi NPP (vero colore)', en: 'VIIRS Suomi NPP (true color)' },
    description: {
      it: 'Vero colore diurno, sensore VIIRS sul satellite Suomi NPP. Spesso più definito di MODIS.',
      en: 'Daytime true color from the VIIRS sensor on Suomi NPP. Usually sharper than MODIS.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    attribution: GIBS_ATTR,
    maxZoom: 9,
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    category: 'base',
  },
  {
    id: 'gibs_blackmarble',
    name: { it: 'VIIRS Black Marble (luci 2016)', en: 'VIIRS Black Marble (2016 lights)' },
    description: {
      it: 'Luci notturne globali catturate da VIIRS nel 2016. Statico.',
      en: 'Global nighttime lights captured by VIIRS in 2016. Static layer.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/${TIME}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
    attribution: `${GIBS_ATTR} · Black Marble`,
    maxZoom: 8,
    matrixSet: 'GoogleMapsCompatible_Level8',
    format: 'png',
    category: 'base',
    staticDate: '2016-01-01',
  },
  {
    id: 'gibs_clouds_geocolor',
    name: { it: 'GOES GeoColor (nuvole live)', en: 'GOES GeoColor (live clouds)' },
    description: {
      it: 'Composito GOES-East ABI GeoColor, aggiornato ogni ~10 minuti. Diurno + notturno.',
      en: 'GOES-East ABI GeoColor composite, updated every ~10 minutes. Day + night.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/${TIME}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
    attribution: `${GIBS_ATTR} · NOAA GOES-East`,
    maxZoom: 7,
    matrixSet: 'GoogleMapsCompatible_Level7',
    format: 'png',
    category: 'base',
    isRealTime: true,
    realTimeStepMin: 10,
    realTimeLagMin: 20,
  },
  // --- OVERLAY LAYERS (semitrasparenti, stackabili) ---
  {
    id: 'gibs_temperature',
    name: { it: 'Temperatura superficie (AIRS)', en: 'Surface temperature (AIRS)' },
    description: {
      it: 'Temperatura aria superficie diurna AIRS L2. Gradiente blu→rosso.',
      en: 'AIRS L2 daytime surface air temperature. Blue→red gradient.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/AIRS_L2_Surface_Air_Temperature_Day/default/${TIME}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    attribution: GIBS_ATTR,
    maxZoom: 6,
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    category: 'overlay',
  },
  {
    id: 'gibs_aerosol',
    name: { it: 'Aerosol (AOD MODIS)', en: 'Aerosol (MODIS AOD)' },
    description: {
      it: 'Aerosol Optical Depth combinato MODIS Terra + Aqua. Indica polveri, fumo, smog.',
      en: 'Combined MODIS Terra + Aqua Aerosol Optical Depth. Dust, smoke, smog.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_Value-Added_AOD/default/${TIME}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    attribution: GIBS_ATTR,
    maxZoom: 6,
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    category: 'overlay',
  },
  {
    id: 'gibs_fires',
    name: { it: 'Incendi attivi (MODIS)', en: 'Active fires (MODIS)' },
    description: {
      it: 'Incendi attivi ultimi 1 giorno da MODIS Terra+Aqua. Fallback FIRMS senza key.',
      en: 'Active fires last 1 day from MODIS Terra+Aqua. FIRMS fallback without API key.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Fires_All/default/${TIME}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
    attribution: GIBS_ATTR,
    maxZoom: 9,
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'png',
    category: 'overlay',
  },
  {
    id: 'gibs_snow',
    name: { it: 'Copertura nevosa (MODIS)', en: 'Snow cover (MODIS)' },
    description: {
      it: 'Copertura nevosa MODIS Terra. Aggiornata 1×/giorno.',
      en: 'MODIS Terra snow cover. Updated once a day.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Snow_Cover/default/${TIME}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
    attribution: GIBS_ATTR,
    maxZoom: 8,
    matrixSet: 'GoogleMapsCompatible_Level8',
    format: 'png',
    category: 'overlay',
  },
  {
    id: 'gibs_seaice',
    name: { it: 'Ghiaccio marino (AMSR2)', en: 'Sea ice (AMSR2)' },
    description: {
      it: 'Concentrazione ghiaccio marino 12km dal sensore AMSR2 (GCOM-W1).',
      en: 'AMSR2 12 km sea ice concentration from GCOM-W1.',
    },
    url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/AMSR2_Sea_Ice_Concentration_12km/default/${TIME}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    attribution: GIBS_ATTR,
    maxZoom: 6,
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    category: 'overlay',
  },
];

export const GIBS_BY_ID: Record<string, GibsLayer> = Object.fromEntries(
  GIBS_LAYERS.map((l) => [l.id, l]),
);

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatIso(d: Date): string {
  return `${formatDateOnly(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

/**
 * Calcola il timestamp da iniettare nel template del layer.
 *  - staticDate          → ritorna staticDate
 *  - isRealTime=true     → arrotonda a `realTimeStepMin` indietro nel tempo, applica `realTimeLagMin`
 *  - daily layer (default) → date - 1 giorno, ISO date-only
 */
export function gibsTimeFor(layer: GibsLayer, now: Date = new Date()): string {
  if (layer.staticDate) return layer.staticDate;
  if (layer.isRealTime) {
    const stepMin = layer.realTimeStepMin ?? 10;
    const lagMin = layer.realTimeLagMin ?? 15;
    const ts = now.getTime() - lagMin * 60_000;
    const stepMs = stepMin * 60_000;
    const rounded = new Date(Math.floor(ts / stepMs) * stepMs);
    return formatIso(rounded);
  }
  const yesterday = new Date(now.getTime() - 86_400_000);
  return formatDateOnly(yesterday);
}

/** URL del tile pronto da passare a TileLayer di Leaflet. */
export function gibsTileUrl(layer: GibsLayer, now: Date = new Date()): string {
  return layer.url.replace('{date}', gibsTimeFor(layer, now));
}

/** Layer raggruppati per categoria, comodi per la UI del LayerPanel. */
export const GIBS_BASE_LAYERS = GIBS_LAYERS.filter((l) => l.category === 'base');
export const GIBS_OVERLAY_LAYERS = GIBS_LAYERS.filter((l) => l.category === 'overlay');

/**
 * Soglia oltre la quale mostriamo un warning all'utente perché ogni overlay
 * GIBS attivo equivale a un set di tile in più scaricati dal CDN NASA.
 * 3 è il numero a cui in mobile 4G iniziamo a vedere ritardi percepibili.
 */
export const GIBS_OVERLAY_WARN_THRESHOLD = 3;

export interface GibsOverlayActive {
  id: string;
  shortLabel: string;
}

/**
 * Filtra il record `overlays` dello store ai soli overlay GIBS attivi.
 * Esposto per i panel (LayerPanel warning, attribution chip, badge contatore).
 *
 * NB: non considera `category === 'base'`, che vive in `baseLayer` separato.
 */
export function activeGibsOverlays(
  overlaysState: Record<string, { enabled: boolean }>,
): GibsOverlayActive[] {
  const out: GibsOverlayActive[] = [];
  for (const layer of GIBS_OVERLAY_LAYERS) {
    if (overlaysState[layer.id]?.enabled) {
      out.push({ id: layer.id, shortLabel: shortLabelFor(layer.id) });
    }
  }
  return out;
}

/** Etichetta corta per l'attribution chip (no i18n: nomi tecnici di sensori). */
function shortLabelFor(id: string): string {
  switch (id) {
    case 'gibs_temperature':
      return 'AIRS';
    case 'gibs_aerosol':
      return 'MODIS AOD';
    case 'gibs_fires':
      return 'MODIS Fires';
    case 'gibs_snow':
      return 'MODIS Snow';
    case 'gibs_seaice':
      return 'AMSR2 Sea Ice';
    default:
      return id;
  }
}
