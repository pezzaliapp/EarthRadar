import {
  DEFAULT_UPSTREAM_BASE_URL,
  MAX_POSITION_AGE_S,
  MAX_RADIUS_NM,
  NM_TO_KM,
  UPSTREAM_TIMEOUT_MS,
  USER_AGENT,
} from '../config.ts';
import { AnonymousIds } from '../anonymize.ts';
import { normalizeReadsbResponse } from '../normalize.ts';
import type { Area, ProviderInfo } from '../types.ts';
import { UpstreamError, type AircraftProvider, type ProviderFetchResult } from './types.ts';

/**
 * Provider FlyItalyADSB — REST API v2, endpoint
 * `GET /lat/{lat}/lon/{lon}/dist/{km}` (raggio in km), autenticazione con
 * header `X-Api-Key`. Formato readsb (`ac[]`, `now`).
 *
 * Il contratto pubblico del gateway resta in NM: la conversione avviene qui.
 * La chiave arriva dal secret `FLYITALYADSB_API_KEY` e viene usata SOLO
 * nell'header della richiesta upstream: mai in URL, messaggi d'errore, log
 * o risposte.
 */

export const FLY_ITALY_ADSB_INFO: ProviderInfo = {
  id: 'flyitalyadsb',
  name: 'FlyItalyADSB',
  url: 'https://flyitalyadsb.com/',
  attribution: 'Aircraft data: FlyItalyADSB (flyitalyadsb.com) · ADS-B/MLAT data · CC BY-SA 4.0',
  license: {
    id: 'CC-BY-SA-4.0',
    name: 'Creative Commons Attribution-ShareAlike 4.0 International',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
};

export interface FlyItalyAdsbProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxPositionAgeS?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
  anonymousIds?: AnonymousIds;
}

/** km interi, arrotondati per eccesso: l'area coperta non è mai più piccola di quella richiesta. */
export function nmToKm(radiusNm: number): number {
  return Math.ceil(radiusNm * NM_TO_KM);
}

export function buildAreaUrl(baseUrl: string, area: Area): string {
  if (!Number.isInteger(area.radiusNm) || area.radiusNm < 1 || area.radiusNm > MAX_RADIUS_NM) {
    throw new RangeError(`radius must be an integer in 1..${MAX_RADIUS_NM} NM`);
  }
  if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) {
    throw new RangeError('lat/lon must be finite');
  }
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/lat/${area.lat}/lon/${area.lon}/dist/${nmToKm(area.radiusNm)}`;
}

/** `Retry-After` in secondi o come data HTTP. */
export function parseRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

export function createFlyItalyAdsbProvider(
  opts: FlyItalyAdsbProviderOptions = {},
): AircraftProvider {
  const apiKey = opts.apiKey?.trim() ?? '';
  const baseUrl = opts.baseUrl || DEFAULT_UPSTREAM_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const maxPositionAgeS = opts.maxPositionAgeS ?? MAX_POSITION_AGE_S;
  const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? (() => Date.now());
  // Un registro per istanza del provider (= per isolate): token stabili fra aggiornamenti.
  const anonymousIds = opts.anonymousIds ?? new AnonymousIds({ now });

  async function fetchArea(area: Area): Promise<ProviderFetchResult> {
    // Senza chiave FlyItalyADSB rifiuta all'edge: non sprechiamo la chiamata.
    if (!apiKey) throw new UpstreamError('not_configured', 'FlyItalyADSB API key not configured');

    const url = buildAreaUrl(baseUrl, area);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = now();
    let text: string;
    let contentLength: number | null = null;
    try {
      let res: Response;
      try {
        res = await fetchFn(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, 'X-Api-Key': apiKey },
          signal: controller.signal,
        });
      } catch {
        // Nessun dettaglio dell'errore nel messaggio: non deve mai poter contenere la richiesta.
        if (controller.signal.aborted) {
          throw new UpstreamError('timeout', `FlyItalyADSB timeout after ${timeoutMs} ms`);
        }
        throw new UpstreamError('network', 'FlyItalyADSB network error');
      }

      if (res.status === 429) {
        throw new UpstreamError(
          'rate_limited',
          'FlyItalyADSB 429',
          429,
          parseRetryAfterMs(res.headers.get('Retry-After'), now()),
        );
      }
      if (res.status >= 500)
        throw new UpstreamError('http_5xx', `FlyItalyADSB HTTP ${res.status}`, res.status);
      if (res.status >= 400)
        throw new UpstreamError('http_4xx', `FlyItalyADSB HTTP ${res.status}`, res.status);
      if (res.status !== 200) {
        throw new UpstreamError(
          'invalid',
          `FlyItalyADSB unexpected HTTP ${res.status}`,
          res.status,
        );
      }

      const len = Number(res.headers.get('Content-Length'));
      contentLength = Number.isFinite(len) && len > 0 ? len : null;
      try {
        text = await res.text();
      } catch {
        if (controller.signal.aborted) {
          throw new UpstreamError('timeout', `FlyItalyADSB timeout after ${timeoutMs} ms`);
        }
        throw new UpstreamError('network', 'FlyItalyADSB body read error');
      }
    } finally {
      clearTimeout(timer);
    }
    const upstreamMs = now() - t0;

    const t1 = now();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UpstreamError('invalid', 'FlyItalyADSB returned non-JSON body');
    }
    let normalized;
    try {
      normalized = normalizeReadsbResponse(json, { maxPositionAgeS, anonymousIds });
    } catch (err) {
      throw new UpstreamError('invalid', `FlyItalyADSB payload rejected: ${String(err)}`);
    }
    return {
      ...normalized,
      upstreamBytes: contentLength ?? text.length,
      upstreamMs,
      normalizeMs: now() - t1,
    };
  }

  return { info: FLY_ITALY_ADSB_INFO, fetchArea };
}
