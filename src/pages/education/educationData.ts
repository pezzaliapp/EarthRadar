/**
 * Education page indexes.
 *
 * Structural metadata (IDs, ordering, external URLs, screenshot paths).
 * The actual divulgative copy lives in `src/i18n/{it,en}.json` under
 * `education.*` so it can be translated without touching component code.
 */

export const EDUCATION_SECTIONS = ['layers', 'glossary', 'tutorials', 'sources', 'extra'] as const;
export type EducationSection = (typeof EDUCATION_SECTIONS)[number];

export interface LayerEntry {
  id: string;
  icon: string;
  sourceHref: string;
}

export const LAYERS: LayerEntry[] = [
  { id: 'quakes', icon: '🌍', sourceHref: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/' },
  { id: 'satellites', icon: '🛰️', sourceHref: 'https://celestrak.org/' },
  { id: 'iss', icon: '🚀', sourceHref: 'https://wheretheiss.at/' },
  { id: 'aircraft', icon: '✈️', sourceHref: 'https://opensky-network.org/' },
  { id: 'fires', icon: '🔥', sourceHref: 'https://firms.modaps.eosdis.nasa.gov/' },
  { id: 'eonet', icon: '🌪️', sourceHref: 'https://eonet.gsfc.nasa.gov/' },
  { id: 'gibs', icon: '☁️', sourceHref: 'https://gibs.earthdata.nasa.gov/' },
  { id: 'rainviewer', icon: '🌧️', sourceHref: 'https://www.rainviewer.com/api.html' },
  { id: 'weather', icon: '🌦️', sourceHref: 'https://open-meteo.com/' },
];

export interface GlossaryEntry {
  id: string;
  wikipedia?: string;
}

// Sorting is alphabetical by `term` at render time, not by id.
export const GLOSSARY: GlossaryEntry[] = [
  { id: 'aod', wikipedia: 'https://en.wikipedia.org/wiki/Aerosol#Aerosol_optical_depth' },
  { id: 'apogee', wikipedia: 'https://it.wikipedia.org/wiki/Apside' },
  { id: 'bolide', wikipedia: 'https://it.wikipedia.org/wiki/Bolide' },
  { id: 'eccentricity', wikipedia: 'https://it.wikipedia.org/wiki/Eccentricit%C3%A0_orbitale' },
  { id: 'ephemeris', wikipedia: 'https://it.wikipedia.org/wiki/Effemeride' },
  { id: 'frp', wikipedia: 'https://en.wikipedia.org/wiki/Fire_radiative_power' },
  { id: 'gnss' }, // GPS / Galileo / GLONASS / BeiDou
  { id: 'heoLeoMeoGeo' },
  { id: 'hotspot' },
  { id: 'inclination', wikipedia: 'https://it.wikipedia.org/wiki/Inclinazione_orbitale' },
  { id: 'magApparent', wikipedia: 'https://it.wikipedia.org/wiki/Magnitudine_apparente' },
  { id: 'magRichter', wikipedia: 'https://it.wikipedia.org/wiki/Scala_Richter' },
  { id: 'noradId' },
  { id: 'perigee', wikipedia: 'https://it.wikipedia.org/wiki/Apside' },
  { id: 'hypocentralDepth', wikipedia: 'https://it.wikipedia.org/wiki/Ipocentro' },
  { id: 'sgp4', wikipedia: 'https://en.wikipedia.org/wiki/Simplified_perturbations_models' },
  { id: 'terminator', wikipedia: 'https://it.wikipedia.org/wiki/Terminatore_(astronomia)' },
  { id: 'tle', wikipedia: 'https://en.wikipedia.org/wiki/Two-line_element_set' },
  { id: 'wmoCodes', wikipedia: 'https://en.wikipedia.org/wiki/WMO_4677' },
  { id: 'wmts' },
  { id: 'wms' },
  { id: 'adsB', wikipedia: 'https://it.wikipedia.org/wiki/Automatic_Dependent_Surveillance-Broadcast' },
  { id: 'epoch' },
  { id: 'orbitalPeriod', wikipedia: 'https://it.wikipedia.org/wiki/Periodo_orbitale' },
  { id: 'tsunami', wikipedia: 'https://it.wikipedia.org/wiki/Tsunami' },
];

export interface TutorialEntry {
  id: string;
  stepCount: number;
  /** Relative path to the screenshot used as placeholder (under /docs/screenshots/edu/). */
  screenshot: string;
}

export const TUTORIALS: TutorialEntry[] = [
  { id: 'iss', stepCount: 4, screenshot: 'tutorial-iss.png' },
  { id: 'quake', stepCount: 3, screenshot: 'tutorial-quake.png' },
  { id: 'satellite', stepCount: 3, screenshot: 'tutorial-satellite.png' },
  { id: 'storm', stepCount: 3, screenshot: 'tutorial-storm.png' },
];

export interface DataSourceEntry {
  id: string;
  url: string;
  /** Optional logo path under /public/logos/. Component falls back to a glyph if missing. */
  logo?: string;
}

export const DATA_SOURCES: DataSourceEntry[] = [
  { id: 'nasaGibs', url: 'https://gibs.earthdata.nasa.gov/' },
  { id: 'eonet', url: 'https://eonet.gsfc.nasa.gov/' },
  { id: 'firms', url: 'https://firms.modaps.eosdis.nasa.gov/' },
  { id: 'visibleEarth', url: 'https://visibleearth.nasa.gov/' },
  { id: 'usgsEq', url: 'https://earthquake.usgs.gov/' },
  { id: 'noaaGoes', url: 'https://www.star.nesdis.noaa.gov/goes/' },
  { id: 'celestrak', url: 'https://celestrak.org/' },
  { id: 'opensky', url: 'https://opensky-network.org/' },
  { id: 'openmeteo', url: 'https://open-meteo.com/' },
  { id: 'rainviewer', url: 'https://www.rainviewer.com/' },
  { id: 'wtiss', url: 'https://wheretheiss.at/' },
];
