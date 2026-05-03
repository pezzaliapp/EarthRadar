import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'it' | 'en';
export type ViewMode = '2d' | '3d';

interface SettingsState {
  language: Language;
  viewMode: ViewMode;
  disclaimerAcknowledged: boolean;
  notificationsEnabled: boolean;
  setLanguage: (lang: Language) => void;
  setViewMode: (mode: ViewMode) => void;
  acknowledgeDisclaimer: () => void;
  setNotificationsEnabled: (v: boolean) => void;
}

function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'it';
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'it';
}

function detectInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return '3d';
  // Default mobile = 2D (perf), desktop = 3D (immersione).
  return window.matchMedia('(max-width: 768px)').matches ? '2d' : '3d';
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: detectLanguage(),
      viewMode: detectInitialViewMode(),
      disclaimerAcknowledged: false,
      notificationsEnabled: false,
      setLanguage: (language) => set({ language }),
      setViewMode: (viewMode) => set({ viewMode }),
      acknowledgeDisclaimer: () => set({ disclaimerAcknowledged: true }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    {
      name: 'earthradar:settings',
      version: 1,
    },
  ),
);
