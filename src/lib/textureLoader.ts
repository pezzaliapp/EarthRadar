/**
 * Adaptive texture URL builder per il Globe3D.
 *
 * Decisione 6 di CLAUDE.md (chiarificazioni post-review): "Texture Blue Marble
 * adattiva: 2K per mobile, 8K per desktop, via CDN NASA Visible Earth
 * (visibleearth.nasa.gov / eoimages.gsfc.nasa.gov)".
 *
 * Detection
 *  - mobile heuristic: matchMedia('(max-width: 768px)') OR
 *    navigator.deviceMemory < 4 (Chrome/Edge property, undefined su Safari →
 *    consideriamo "non low-mem" e affidiamo all'altro check)
 *  - se siamo in tile size mobile, usiamo 2K. Altrimenti 8K.
 *
 * URL canonici da NASA Visible Earth (Blue Marble Next Generation 2004
 * + Black Marble 2016):
 *  - Blue Marble 2K: world.topo.200412.3x5400x2700.jpg (5400×2700)
 *  - Blue Marble 8K: world.topo.200412.3x21600x10800.jpg (21600×10800)
 *  - Black Marble 2K: BlackMarble_2016_3km_geo.jpg
 *  - Black Marble 8K: BlackMarble_2016_01deg_geo.jpg
 *
 * Le funzioni sono pure: prendono i flag come argomenti, così il chiamante
 * può iniettarli nei test (jsdom non implementa matchMedia/deviceMemory in
 * modo affidabile).
 */

const NASA_VE_BASE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords';

// ---- Blue Marble Next Generation (April 2004 composite) ----
const BLUE_MARBLE_2K =
  `${NASA_VE_BASE}/73000/73938/world.topo.200412.3x5400x2700.jpg`;
const BLUE_MARBLE_8K =
  `${NASA_VE_BASE}/73000/73938/world.topo.200412.3x21600x10800.jpg`;

// ---- Black Marble 2016 (VIIRS Day-Night Band) ----
const BLACK_MARBLE_2K =
  `${NASA_VE_BASE}/144000/144898/BlackMarble_2016_3km_geo.jpg`;
const BLACK_MARBLE_8K =
  `${NASA_VE_BASE}/144000/144898/BlackMarble_2016_01deg_geo.jpg`;

// ---- Bump map (NASA Visible Earth elevation, opzionale) ----
const BUMP_MAP_URL =
  `${NASA_VE_BASE}/73000/73934/world.topo.bathy.200412.3x5400x2700.jpg`;

export interface TextureSet {
  blueMarble: string;
  blackMarble: string;
  /** Bump map elevation. Solo desktop con `enableBump = true`. */
  bumpMap: string | null;
  /** True se siamo nella variante "lite" (2K, no bump). */
  isLite: boolean;
}

export interface DeviceProfile {
  /** True se il viewport è ≤ 768px. */
  isNarrow: boolean;
  /** `navigator.deviceMemory` se esposto, altrimenti null. */
  deviceMemoryGb: number | null;
  /** True per disabilitare bump map (dispositivi medi). */
  isLowEnd: boolean;
}

/**
 * Sintetizza un profilo device puro. Esposto per testabilità: in produzione
 * lo wrap-er `detectDeviceProfile()` legge i valori da `window`.
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
 * Risolve il set di texture per il device. Esposto puro così i test possono
 * forzare un profilo arbitrario senza toccare jsdom.
 */
export function resolveTextureSet(profile: DeviceProfile): TextureSet {
  if (profile.isLowEnd) {
    return {
      blueMarble: BLUE_MARBLE_2K,
      blackMarble: BLACK_MARBLE_2K,
      bumpMap: null,
      isLite: true,
    };
  }
  return {
    blueMarble: BLUE_MARBLE_8K,
    blackMarble: BLACK_MARBLE_8K,
    bumpMap: BUMP_MAP_URL,
    isLite: false,
  };
}

/** Comoda combo `detect + resolve`. */
export function autoTextureSet(): TextureSet {
  return resolveTextureSet(detectDeviceProfile());
}
