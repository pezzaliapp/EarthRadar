import type { AircraftDTO, Area, NormalizeStats, ProviderInfo } from '../types.ts';

export type UpstreamErrorKind =
  | 'timeout'
  | 'network'
  | 'rate_limited'
  | 'http_4xx'
  | 'http_5xx'
  | 'invalid'
  /** Provider non configurato (chiave assente): nessuna chiamata effettuata. */
  | 'not_configured';

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    kind: UpstreamErrorKind,
    message: string,
    httpStatus: number | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface ProviderFetchResult {
  providerTime: number | null;
  aircraft: AircraftDTO[];
  stats: NormalizeStats;
  /** Dimensione del corpo upstream (content-length o lunghezza testo). */
  upstreamBytes: number;
  upstreamMs: number;
  normalizeMs: number;
}

/** Interfaccia che ogni provider deve rispettare: sostituibile senza toccare il frontend. */
export interface AircraftProvider {
  readonly info: ProviderInfo;
  fetchArea(area: Area): Promise<ProviderFetchResult>;
}
