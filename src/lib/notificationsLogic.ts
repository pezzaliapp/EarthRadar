/**
 * Pure logic per le notifiche opt-in di EarthRadar v1.0.
 *
 * Triggers MVP:
 *  - Terremoto M ≥ 5 entro 1000 km dalla posizione utente
 *  - Prossimo passaggio ISS visibile entro 30 minuti
 *
 * Anti-spam: cooldown 30 min per categoria, persistito in localStorage.
 *
 * Le funzioni sono pure: prendono `now` / quakes / passes / userLoc come
 * argomenti. Esposte separatamente dall'hook per permettere unit test
 * senza Notification API.
 */

import { haversineKm } from '@/utils/geo';
import type { Quake } from '@/services/usgsQuakesApi';
import type { Pass } from '@/lib/passPredictor';

export type NotificationCategory = 'quake' | 'iss';

export const QUAKE_MAGNITUDE_THRESHOLD = 5;
export const QUAKE_RADIUS_KM = 1000;
export const ISS_WINDOW_MINUTES = 30;
export const COOLDOWN_MS = 30 * 60 * 1000;

export interface QuakeNotifyCandidate {
  quake: Quake;
  distanceKm: number;
}

/**
 * Trova il quake "più rilevante" da notificare:
 * - magnitudo ≥ threshold (default 5)
 * - distanza ≤ radius (default 1000 km dalla userLoc)
 * - tempo entro windowMs (default 6 ore: tagliamo i quake troppo vecchi)
 *
 * Restituisce il quake con la magnitudo più alta tra quelli idonei
 * (in caso di parità, il più recente).
 */
export function findQuakeNotifyCandidate(
  quakes: readonly Quake[],
  userLoc: { lat: number; lon: number } | null,
  now: number = Date.now(),
  opts: {
    magnitudeMin?: number;
    radiusKm?: number;
    windowMs?: number;
  } = {},
): QuakeNotifyCandidate | null {
  if (!userLoc) return null;
  const magMin = opts.magnitudeMin ?? QUAKE_MAGNITUDE_THRESHOLD;
  const radius = opts.radiusKm ?? QUAKE_RADIUS_KM;
  const window = opts.windowMs ?? 6 * 60 * 60 * 1000;

  const candidates: QuakeNotifyCandidate[] = [];
  for (const q of quakes) {
    if (q.magnitude < magMin) continue;
    if (now - q.time > window) continue;
    const distanceKm = haversineKm(userLoc.lat, userLoc.lon, q.lat, q.lon);
    if (distanceKm > radius) continue;
    candidates.push({ quake: q, distanceKm });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.quake.magnitude !== a.quake.magnitude) {
      return b.quake.magnitude - a.quake.magnitude;
    }
    return b.quake.time - a.quake.time;
  });
  return candidates[0];
}

export interface IssNotifyCandidate {
  pass: Pass;
  minutesUntil: number;
}

/**
 * Trova il prossimo pass ISS visibile entro `windowMinutes`.
 * Solo passaggi con `visible = true` (sole sotto orizzonte +
 * ISS illuminata, vedi passPredictor).
 */
export function findIssNotifyCandidate(
  passes: readonly Pass[],
  now: number = Date.now(),
  windowMinutes: number = ISS_WINDOW_MINUTES,
): IssNotifyCandidate | null {
  const windowMs = windowMinutes * 60 * 1000;
  for (const p of passes) {
    if (!p.visible) continue;
    const delta = p.start - now;
    if (delta < 0) continue; // già passato
    if (delta > windowMs) continue;
    return { pass: p, minutesUntil: Math.round(delta / 60000) };
  }
  return null;
}

// ─── Cooldown persistence ──────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'earthradar:notification:lastFiredAt:';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Vero se il cooldown per una categoria è scaduto.
 * Storage iniettabile: in test usiamo un Map.
 */
export function cooldownExpired(
  category: NotificationCategory,
  now: number = Date.now(),
  cooldownMs: number = COOLDOWN_MS,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return true; // SSR / no storage → consenti
  const raw = storage.getItem(STORAGE_KEY_PREFIX + category);
  if (raw === null) return true;
  const last = Number.parseInt(raw, 10);
  if (!Number.isFinite(last)) return true;
  return now - last >= cooldownMs;
}

export function markNotificationFired(
  category: NotificationCategory,
  now: number = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(STORAGE_KEY_PREFIX + category, String(now));
}
