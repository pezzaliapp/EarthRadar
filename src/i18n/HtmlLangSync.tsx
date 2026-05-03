import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

export default function HtmlLangSync() {
  const language = useSettingsStore((s) => s.language);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}
