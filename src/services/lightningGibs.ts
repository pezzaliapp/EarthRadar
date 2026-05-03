/**
 * NASA GIBS — fulmini.
 *
 * v1.0 (questa fase): tile statico LIS/TRMM Full Climatology Mean Flash
 * Rate. È una densità globale di fulmini (eventi/anno/km²) misurata dal
 * sensor LIS su TRMM (1998–2015) e poi su ISS-LIS, esposta da GIBS come
 * snapshot statico (date param `default`).
 *
 * Decisione 7 di CLAUDE.md / scope Fase 2.8: il prodotto NASA GLM
 * (Geostationary Lightning Mapper) real-time NON è esposto da GIBS al
 * momento (verificato via WMTS GetCapabilities il 2026-05-03: nessuno dei
 * candidati `GOES-East_ABI_GLM_*` è registrato). Anziché ripiegare su
 * `GOES-East_ABI_GeoColor` (che è clouds, non fulmini), abbiamo scelto
 * la climatologia LIS che, pur essendo statica, è SEMANTICAMENTE corretta
 * (la domanda "dove cadono di più i fulmini sulla Terra?" trova risposta
 * qui). La copertura è globale, ±38° latitudine per LIS/TRMM esteso poi
 * con ISS-LIS, leggermente sfumato ai poli.
 *
 * v1.1 (futura): aggiungeremo strike live via WS Blitzortung sopra questo
 * tile, mantenendo il TileLayer come layer di sfondo per dare contesto
 * climatologico. Vedi `Strike` interface in `LightningLayer.tsx`, già
 * predisposta per i marker live.
 */

export const LIGHTNING_LIS_LAYER_ID =
  'LIS_Very_High_Resolution_Lightning_Full_Climatology_LIS_Mean_Flash_Rate';

const TILE_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const MATRIX_SET = 'GoogleMapsCompatible_Level6';

/**
 * URL template Leaflet per il tile LIS climatology. La data è `default`
 * (snapshot statico GIBS). Restituisce un template con `{z}/{y}/{x}.png`
 * compatibile con `react-leaflet` `<TileLayer />`.
 */
export function lightningTileUrl(): string {
  return `${TILE_BASE}/${LIGHTNING_LIS_LAYER_ID}/default/default/${MATRIX_SET}/{z}/{y}/{x}.png`;
}

export const LIGHTNING_MAX_NATIVE_ZOOM = 6;
export const LIGHTNING_ATTRIBUTION =
  '<a href="https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs">NASA GIBS</a> · LIS/TRMM Climatology';
