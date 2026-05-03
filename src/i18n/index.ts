import { useSettingsStore, type Language } from '@/store/settingsStore';
import it from './it.json';
import en from './en.json';

const dictionaries = { it, en } as const;

type Dict = typeof it;

function deepGet(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function translate(language: Language, key: string, params?: Record<string, string | number>) {
  const value = deepGet(dictionaries[language] as Dict, key) ?? deepGet(dictionaries.it as Dict, key);
  if (typeof value !== 'string') return key;
  if (!params) return value;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v)),
    value,
  );
}

export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  return {
    language,
    t: (key: string, params?: Record<string, string | number>) => translate(language, key, params),
  };
}

export function detectInitialLanguage(): Language {
  if (typeof navigator === 'undefined') return 'it';
  const lang = navigator.language?.toLowerCase() ?? '';
  return lang.startsWith('en') ? 'en' : 'it';
}
