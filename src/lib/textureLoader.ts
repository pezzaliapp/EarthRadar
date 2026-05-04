/**
 * Texture URL builder per il Globe3D — versione locale (CORS-free).
 *
 * Storia
 *  - Versione iniziale (Fase 3) puntava al CDN NASA Visible Earth
 *    (eoimages.gsfc.nasa.gov).
 *  - In dev sul localhost il browser blocca il fetch perché il CDN NASA
 *    NON espone gli header `Access-Control-Allow-Origin`. THREE.TextureLoader
 *    fa fetch + readPixels → bloccato → globo nero.
 *  - In prod su GitHub Pages è esattamente lo stesso problema (no CORS proxy).
 *  - Soluzione: hostare le texture in `public/textures/` e servirle dallo
 *    stesso origin del frontend. Same-origin, niente CORS.
 *
 * Dimensioni e budget
 *  - 2048×1024 equirectangular per Blue Marble + Black Marble.
 *  - JPEG quality 80, totale ~520 KB sul disco. Più che sufficiente per il
 *    rendering sferico a livello 1 (256² → 512² → 1024² → 2048²).
 *  - Niente 8K: committare 30+ MB di texture nel repo è sproporzionato per
 *    il valore aggiunto. CLAUDE.md dec. 6 ammetteva esplicitamente
 *    "altrimenti solo 2K, è sufficiente per il MVP".
 *  - Niente bump map: la sorgente NASA originale a cui puntava la versione
 *    CDN non è più al path canonico (404), e non era essenziale. `bumpMap`
 *    resta nell'interfaccia come `null` per non rompere il consumer.
 *
 * URL
 *  - In dev: `/textures/earth-blue-marble-2k.jpg` (Vite serve da `public/`)
 *  - In prod: `/EarthRadar/textures/earth-blue-marble-2k.jpg` (base prefix
 *    risolto da `import.meta.env.BASE_URL`).
 *
 * Detection
 *  - mobile heuristic: matchMedia('(max-width: 768px)') OR
 *    navigator.deviceMemory < 4 (Chrome/Edge property, undefined su Safari →
 *    consideriamo "non low-mem" e affidiamo all'altro check).
 *  - `isLowEnd` resta esposto come flag per il chiamante: oggi non cambia
 *    la texture set (le abbiamo entrambe a 2K), ma il consumer Globe3D
 *    può usarla per altri tweak (atmosphereAltitude, antialias, sample rate).
 *
 * Le funzioni sono pure: prendono i flag come argomenti, così il chiamante
 * può iniettarli nei test (jsdom non implementa matchMedia/deviceMemory in
 * modo affidabile).
 */

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/+$/, '/');

const BLUE_MARBLE_URL = `${BASE}textures/earth-blue-marble-2k.jpg`;
const BLACK_MARBLE_URL = `${BASE}textures/earth-black-marble-2k.jpg`;

export interface TextureSet {
  blueMarble: string;
  blackMarble: string;
  /**
   * Bump map elevation. Sempre `null` nel MVP locale: l'asset NASA al path
   * canonico non è più disponibile e ospitarne uno proprio è marginale.
   */
  bumpMap: string | null;
  /**
   * `true` per dispositivi narrow / low-mem. Non cambia più la texture set
   * (sempre 2K), ma il consumer può usarla per disabilitare effetti.
   */
  isLite: boolean;
}

export interface DeviceProfile {
  /** True se il viewport è ≤ 768px. */
  isNarrow: boolean;
  /** `navigator.deviceMemory` se esposto, altrimenti null. */
  deviceMemoryGb: number | null;
  /** True per dispositivi mobili / low-mem. */
  isLowEnd: boolean;
}

/**
 * Sintetizza un profilo device puro. Esposto per testabilità: in produzione
 * lo wrapper `detectDeviceProfile()` legge i valori da `window`.
 */
export function buildProfile(input: {
  isNarrow: boolean;
  deviceMemoryGb: number | null;
}): DeviceProfile {
  const lowMem = input.deviceMemoryGb !== null && input.deviceMemoryGb < 4;
  return {
    isNarrow: input.isNarrow,
    deviceMemoryGb: input.deviceMemoryGb,
    isLowEnd: input.isNarrow || lowMem,
  };
}

/** Wrapper runtime-side: legge da `window`/`navigator`. */
export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return { isNarrow: false, deviceMemoryGb: null, isLowEnd: false };
  }
  const isNarrow = window.matchMedia?.('(max-width: 768px)').matches ?? false;
  // navigator.deviceMemory è non-standard ma supportato da Chrome/Edge/Opera.
  const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const deviceMemoryGb = typeof dm === 'number' && Number.isFinite(dm) ? dm : null;
  return buildProfile({ isNarrow, deviceMemoryGb });
}

/**
 * Risolve il set di texture per il device.
 *
 * Versione MVP locale: stessa risoluzione (2K) per tutti, perché ospitiamo
 * solo le 2K nel repo. Il flag `isLite` vive solo come hint downstream.
 */
export function resolveTextureSet(profile: DeviceProfile): TextureSet {
  return {
    blueMarble: BLUE_MARBLE_URL,
    blackMarble: BLACK_MARBLE_URL,
    bumpMap: null,
    isLite: profile.isLowEnd,
  };
}

/** Comoda combo `detect + resolve`. */
export function autoTextureSet(): TextureSet {
  return resolveTextureSet(detectDeviceProfile());
}
