import { useCallback, useEffect, useRef, useState } from 'react';
import { useLayersStore } from '@/store/layersStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useQuakes } from '@/hooks/useQuakes';
import { useIss } from '@/hooks/useIss';
import { predictPasses } from '@/lib/passPredictor';
import { useTranslation } from '@/i18n';
import {
  cooldownExpired,
  findIssNotifyCandidate,
  findQuakeNotifyCandidate,
  markNotificationFired,
  type NotificationCategory,
} from '@/lib/notificationsLogic';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface NotificationsControls {
  permission: NotificationPermission;
  enabled: boolean;
  /** True se Notification API è esposta dal browser. */
  supported: boolean;
  /** Triggera il prompt browser e aggiorna lo stato. */
  request: () => Promise<NotificationPermission>;
  /** Toggle preferenza utente. Indipendente da `permission`. */
  setEnabled: (v: boolean) => void;
}

function readPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermission;
}

function fire(
  category: NotificationCategory,
  title: string,
  body: string,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    // `tag` evita duplicati nello stack OS: una sola notifica per categoria.
    new Notification(title, { body, tag: `earthradar:${category}`, silent: false });
    markNotificationFired(category);
  } catch {
    // Safari iOS può lanciare anche con permission granted in contesti non secure.
    // Silenzioso: non vogliamo cracckare l'app per una notifica fallita.
  }
}

/**
 * Hook leggero (no fetch). Da usare nel toggle in Header / Settings:
 * espone permission + preferenza utente + request, niente di più.
 */
export function useNotificationsControls(): NotificationsControls {
  const enabled = useSettingsStore((s) => s.notificationsEnabled);
  const setEnabledStore = useSettingsStore((s) => s.setNotificationsEnabled);
  const [permission, setPermission] = useState<NotificationPermission>(readPermission);

  const request = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return 'granted';
    }
    if (Notification.permission === 'denied') {
      setPermission('denied');
      return 'denied';
    }
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermission);
    return result as NotificationPermission;
  }, []);

  return {
    permission,
    enabled,
    supported: permission !== 'unsupported',
    request,
    setEnabled: setEnabledStore,
  };
}

/**
 * Hook orchestrazione full (con poll e trigger). Da montare UNA SOLA VOLTA
 * nella Home: sottoscrive useQuakes + useIss e dispatcha Notification se
 * trova un candidato + cooldown scaduto. NotificationsToggle nell'Header
 * usa solo `useNotificationsControls()` per non duplicare i fetch.
 */
export function useNotificationsRunner(): void {
  const { t, language } = useTranslation();
  const enabled = useSettingsStore((s) => s.notificationsEnabled);
  const userLoc = useLayersStore((s) => s.userLocationForPasses);
  const permission = readPermission();
  const active = enabled && permission === 'granted';

  // ISS poll vivo solo se il runner è attivo. useIss(false) non polla.
  const { satrec } = useIss(active);
  // Quakes già pollato dalla Home (cache condivisa); chiamarlo qui costa una
  // sottoscrizione in più ma non duplica i fetch (dedupe via apiCache).
  const { data: quakes } = useQuakes('all_day');

  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [active]);

  // Trigger quake.
  const lastQuakeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !userLoc) return;
    const candidate = findQuakeNotifyCandidate(quakes, userLoc, tick);
    if (!candidate) return;
    if (lastQuakeIdRef.current === candidate.quake.id) return;
    if (!cooldownExpired('quake', tick)) return;
    lastQuakeIdRef.current = candidate.quake.id;
    fire(
      'quake',
      t('notifications.quakeTitle'),
      t('notifications.quakeBody', {
        mag: candidate.quake.magnitude.toFixed(1),
        distanceKm: Math.round(candidate.distanceKm),
        place: candidate.quake.place,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quakes, userLoc, tick, active, language]);

  // Trigger ISS pass.
  const lastIssStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active || !userLoc || !satrec) return;
    const passes = predictPasses({
      satrec,
      observer: userLoc,
      fromMs: tick,
      windowHours: 2,
    });
    const candidate = findIssNotifyCandidate(passes, tick);
    if (!candidate) return;
    if (lastIssStartRef.current === candidate.pass.start) return;
    if (!cooldownExpired('iss', tick)) return;
    lastIssStartRef.current = candidate.pass.start;
    fire(
      'iss',
      t('notifications.issTitle'),
      t('notifications.issBody', {
        minutes: candidate.minutesUntil,
        elevation: Math.round(candidate.pass.maxElevationDeg),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satrec, userLoc, tick, active, language]);
}
