import type { Quake } from '@/services/usgsQuakesApi';

export type QuakeSeverity = 'low' | 'mid' | 'high';

/**
 * Semaforo severità: <4 verde, 4-5 giallo, ≥5 rosso. Convenzione condivisa con MeteorWatch.
 */
export function quakeSeverity(magnitude: number): QuakeSeverity {
  if (magnitude >= 5) return 'high';
  if (magnitude >= 4) return 'mid';
  return 'low';
}

const SEVERITY_COLOR: Record<QuakeSeverity, string> = {
  low: '#34d399',
  mid: '#fbbf24',
  high: '#ef4444',
};

export function quakeSeverityColor(magnitude: number): string {
  return SEVERITY_COLOR[quakeSeverity(magnitude)];
}

/**
 * Raggio del marker sulla mappa, scalato sulla magnitudo.
 * Crescita esponenziale dolce, clamp [4, 32] px.
 */
export function quakeMarkerRadius(magnitude: number): number {
  const r = 3 + Math.pow(Math.max(0, magnitude), 1.6);
  return Math.min(32, Math.max(4, Math.round(r)));
}

export function formatMagnitude(m: number): string {
  if (!Number.isFinite(m)) return '—';
  return `M ${m.toFixed(1)}`;
}

export function formatDepth(depthKm: number): string {
  if (!Number.isFinite(depthKm)) return '—';
  if (depthKm < 1) return `${(depthKm * 1000).toFixed(0)} m`;
  return `${depthKm.toFixed(1)} km`;
}

export function formatDistance(km: number, language: 'it' | 'en' = 'it'): string {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return language === 'it' ? `${Math.round(km * 1000)} m` : `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString(language === 'it' ? 'it-IT' : 'en-US')} km`;
}

/**
 * Tempo relativo localizzato leggibile: "5 min fa" / "5 min ago".
 * Volutamente piccolo, niente date-fns dipendenza qui per restare puro.
 */
export function formatRelativeTime(ts: number, now = Date.now(), language: 'it' | 'en' = 'it'): string {
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (language === 'en') {
    if (diffSec < 60) return `${diffSec}s ago`;
    const m = Math.round(diffSec / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  }
  if (diffSec < 60) return `${diffSec}s fa`;
  const m = Math.round(diffSec / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.round(h / 24);
  return `${d}g fa`;
}

/** Etichetta sintetica per il marker tooltip / listing. */
export function quakeShortLabel(q: Quake): string {
  return `${formatMagnitude(q.magnitude)} · ${q.place || '—'}`;
}
