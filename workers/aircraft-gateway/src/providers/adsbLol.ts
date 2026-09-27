import {
  DEFAULT_UPSTREAM_BASE_URL,
  MAX_POSITION_AGE_S,
  MAX_RADIUS_NM,
  UPSTREAM_TIMEOUT_MS,
  USER_AGENT,
} from '../config.ts';
import { normalizeAdsbLolResponse } from '../normalize.ts';
import type { Area, ProviderInfo } from '../types.ts';
import { UpstreamError, type AircraftProvider, type ProviderFetchResult } from './types.ts';

/**
 * Provider ADSB.lol — endpoint `GET /v2/point/{lat}/{lon}/{radius}`
 * (raggio intero in NM, max 250 da specifica OpenAPI; il server non lo impone
 * e un raggio decimale produce una risposta non JSON, quindi validiamo qui).
 */

export const ADSB_LOL_INFO: ProviderInfo = {
  id: 'adsb.lol',
  name: 'ADSB.lol',
  url: 'https://www.adsb.lol/',
  attribution: 'Aircraft data © ADSB.lol contributors, Open Database License (ODbL) 1.0',
  license: {
    id: 'ODbL-1.0',
    name: 'Open Data Commons Open Database License v1.0',
    url: 'https://opendatacommons.org/licenses/odbl/1-0/',
  },
};

export interface AdsbLolProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxPositionAgeS?: number;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export function buildPointUrl(baseUrl: string, area: Area): string {
  if (!Number.isInteger(area.radiusNm) || area.radiusNm < 1 || area.radiusNm > MAX_RADIUS_NM) {
    throw new RangeError(`radius must be an integer in 1..${MAX_RADIUS_NM}`);
  }
  if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) {
    throw new RangeError('lat/lon must be finite');
  }
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/v2/point/${area.lat}/${area.lon}/${area.radiusNm}`;
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

export function createAdsbLolProvider(opts: AdsbLolProviderOptions = {}): AircraftProvider {
  const baseUrl = opts.baseUrl || DEFAULT_UPSTREAM_BASE_URL;
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const maxPositionAgeS = opts.maxPositionAgeS ?? MAX_POSITION_AGE_S;
  const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? (() => Date.now());

  async function fetchArea(area: Area): Promise<ProviderFetchResult> {
    const url = buildPointUrl(baseUrl, area);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = now();
    let text: string;
    let contentLength: number | null = null;
    try {
      let res: Response;
      try {
        res = await fetchFn(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new UpstreamError('timeout', `ADSB.lol timeout after ${timeoutMs} ms`);
        }
        throw new UpstreamError('network', `ADSB.lol network error: ${String(err)}`);
      }

      if (res.status === 429) {
        throw new UpstreamError(
          'rate_limited',
          'ADSB.lol 429',
          429,
          parseRetryAfterMs(res.headers.get('Retry-After'), now()),
        );
      }
      if (res.status >= 500)
        throw new UpstreamError('http_5xx', `ADSB.lol HTTP ${res.status}`, res.status);
      if (res.status >= 400)
        throw new UpstreamError('http_4xx', `ADSB.lol HTTP ${res.status}`, res.status);
      if (res.status !== 200) {
        throw new UpstreamError('invalid', `ADSB.lol unexpected HTTP ${res.status}`, res.status);
      }

      const len = Number(res.headers.get('Content-Length'));
      contentLength = Number.isFinite(len) && len > 0 ? len : null;
      try {
        text = await res.text();
      } catch (err) {
        if (controller.signal.aborted) {
          throw new UpstreamError('timeout', `ADSB.lol timeout after ${timeoutMs} ms`);
        }
        throw new UpstreamError('network', `ADSB.lol body read error: ${String(err)}`);
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
      throw new UpstreamError('invalid', 'ADSB.lol returned non-JSON body');
    }
    let normalized;
    try {
      normalized = normalizeAdsbLolResponse(json, { maxPositionAgeS });
    } catch (err) {
      throw new UpstreamError('invalid', `ADSB.lol payload rejected: ${String(err)}`);
    }
    return {
      ...normalized,
      upstreamBytes: contentLength ?? text.length,
      upstreamMs,
      normalizeMs: now() - t1,
    };
  }

  return { info: ADSB_LOL_INFO, fetchArea };
}
