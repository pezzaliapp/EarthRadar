// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { corsHeaders, decideCors, parseAllowedOrigins, preflightHeaders } from '../src/cors.ts';

const ALLOWED = parseAllowedOrigins(
  'https://www.alessandropezzali.it, https://pezzaliapp.github.io/ ,http://localhost:5173,javascript:alert(1),*',
);

function req(origin?: string) {
  return new Request('https://gw.example/v1/health', {
    headers: origin === undefined ? {} : { Origin: origin },
  });
}

describe('CORS allowlist', () => {
  it('parse: normalizza e scarta voci non valide (incluso *)', () => {
    expect([...ALLOWED]).toEqual([
      'https://www.alessandropezzali.it',
      'https://pezzaliapp.github.io',
      'http://localhost:5173',
    ]);
  });

  it('origine consentita → ACAO esatto, mai *', () => {
    const d = decideCors(req('https://www.alessandropezzali.it'), ALLOWED);
    expect(d.kind).toBe('allowed');
    const h = corsHeaders(d);
    expect(h['Access-Control-Allow-Origin']).toBe('https://www.alessandropezzali.it');
    expect(h.Vary).toBe('Origin');
  });

  it('origine non consentita o "null" → denied senza ACAO', () => {
    for (const o of ['https://evil.example', 'null', 'https://alessandropezzali.it.evil.example']) {
      const d = decideCors(req(o), ALLOWED);
      expect(d.kind).toBe('denied');
      expect(corsHeaders(d)).not.toHaveProperty('Access-Control-Allow-Origin');
    }
  });

  it('nessun Origin (curl, health check) → no-origin', () => {
    expect(decideCors(req(), ALLOWED).kind).toBe('no-origin');
  });

  it('preflight espone solo GET/HEAD/OPTIONS', () => {
    const h = preflightHeaders({ kind: 'allowed', origin: 'http://localhost:5173' });
    expect(h['Access-Control-Allow-Methods']).toBe('GET, HEAD, OPTIONS');
    expect(h['Access-Control-Max-Age']).toBe('86400');
  });
});
