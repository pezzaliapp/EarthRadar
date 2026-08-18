/**
 * spaRedirect.ts — logica PURA del fallback SPA per GitHub Pages.
 *
 * Rispecchia gli snippet inline in `public/404.html` (encode) e `index.html`
 * (decode). Quegli snippet DEVONO restare inline (girano prima del bundle),
 * quindi qui ne teniamo una copia testabile: mantenere allineate le due parti.
 *
 * Flusso: GitHub Pages serve 404.html per una route sconosciuta
 * (es. /EarthRadar/anomaly) → encode riscrive in /EarthRadar/?/anomaly →
 * index.html (file reale) viene servito → decode ripristina /EarthRadar/anomaly
 * prima che React Router legga l'URL. Nessun reload dopo il decode, nessun loop.
 */

/** Numero di segmenti di path da preservare (base "/EarthRadar/" → 1). */
export const PATH_SEGMENTS_TO_KEEP = 1;

/**
 * Lato 404.html: da (pathname, search, hash) produce l'URL di redirect
 * `<origin><base>/?/<rest>&<query>`.
 */
export function encodeSpaFallbackUrl(
  origin: string,
  pathname: string,
  search = '',
  hash = '',
  pathSegmentsToKeep = PATH_SEGMENTS_TO_KEEP,
): string {
  const base = pathname
    .split('/')
    .slice(0, 1 + pathSegmentsToKeep)
    .join('/');
  const rest = pathname
    .slice(1)
    .split('/')
    .slice(pathSegmentsToKeep)
    .join('/')
    .replace(/&/g, '~and~');
  const query = search ? '&' + search.slice(1).replace(/&/g, '~and~') : '';
  return origin + base + '/?/' + rest + query + hash;
}

/**
 * Lato index.html: se `search` è nel formato "?/…", ricostruisce il path pulito
 * (pathname senza slash finale + path decodificato + hash). Ritorna null se non
 * si tratta di un redirect SPA (load normale o deep-link ?lat=&lon=).
 */
export function decodeSpaFallbackPath(pathname: string, search: string, hash = ''): string | null {
  if (search[1] !== '/') return null;
  const decoded = search
    .slice(1)
    .split('&')
    .map((s) => s.replace(/~and~/g, '&'))
    .join('?');
  return pathname.slice(0, -1) + decoded + hash;
}
