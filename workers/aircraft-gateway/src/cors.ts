/**
 * CORS con allowlist esplicita. Non è una misura di sicurezza (un client non
 * browser può omettere Origin), ma impedisce ad altri siti di usare il
 * gateway dal browser e di consumare la quota gratuita.
 */

export type CorsDecision =
  | { kind: 'no-origin' }
  | { kind: 'allowed'; origin: string }
  | { kind: 'denied'; origin: string };

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (value ?? '').split(',')) {
    const o = part.trim().replace(/\/+$/, '').toLowerCase();
    if (ORIGIN_RE.test(o)) out.add(o);
  }
  return out;
}

export function decideCors(request: Request, allowed: ReadonlySet<string>): CorsDecision {
  const origin = request.headers.get('Origin');
  if (origin === null) return { kind: 'no-origin' };
  const normalized = origin.trim().toLowerCase();
  return allowed.has(normalized) ? { kind: 'allowed', origin } : { kind: 'denied', origin };
}

export function corsHeaders(decision: CorsDecision): Record<string, string> {
  if (decision.kind !== 'allowed') return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': decision.origin,
    'Access-Control-Expose-Headers':
      'Retry-After, Age, X-EarthRadar-Cache, X-EarthRadar-Stale-Reason',
    Vary: 'Origin',
  };
}

export function preflightHeaders(decision: CorsDecision): Record<string, string> {
  return {
    ...corsHeaders(decision),
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Max-Age': '86400',
  };
}
