import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  // Snapshot iniziale per restituire lo store al default tra i test.
  const initial = useSettingsStore.getState();

  beforeEach(() => {
    // Reset store + localStorage (la persist scrive sotto `earthradar:settings`).
    useSettingsStore.setState(initial, true);
    if (typeof window !== 'undefined') window.localStorage.removeItem('earthradar:settings');
  });

  afterEach(() => {
    useSettingsStore.setState(initial, true);
  });

  it('exposes a viewMode that is either 2d or 3d', () => {
    const m = useSettingsStore.getState().viewMode;
    expect(['2d', '3d']).toContain(m);
  });

  it('setViewMode persists the new mode', () => {
    useSettingsStore.getState().setViewMode('2d');
    expect(useSettingsStore.getState().viewMode).toBe('2d');
    useSettingsStore.getState().setViewMode('3d');
    expect(useSettingsStore.getState().viewMode).toBe('3d');
  });

  it('markPerfFallback() switches to 2D and sets the triggered flag', () => {
    useSettingsStore.getState().setViewMode('3d');
    expect(useSettingsStore.getState().perfFallbackTriggered).toBe(false);
    useSettingsStore.getState().markPerfFallback();
    expect(useSettingsStore.getState().viewMode).toBe('2d');
    expect(useSettingsStore.getState().perfFallbackTriggered).toBe(true);
  });

  it('user can re-enable 3D after fallback, but the flag stays', () => {
    useSettingsStore.getState().markPerfFallback();
    useSettingsStore.getState().setViewMode('3d');
    expect(useSettingsStore.getState().viewMode).toBe('3d');
    // La flag NON si auto-resetta: il hook userà questa flag per non
    // ri-triggerare il fallback su un dispositivo già etichettato lento.
    expect(useSettingsStore.getState().perfFallbackTriggered).toBe(true);
  });

  it('language defaults to it or en (browser-derived)', () => {
    const lang = useSettingsStore.getState().language;
    expect(['it', 'en']).toContain(lang);
  });

  it('disclaimer + notifications start as false-ish', () => {
    const s = useSettingsStore.getState();
    expect(s.disclaimerAcknowledged).toBe(false);
    expect(s.notificationsEnabled).toBe(false);
  });

  it('acknowledgeDisclaimer flips the flag', () => {
    useSettingsStore.getState().acknowledgeDisclaimer();
    expect(useSettingsStore.getState().disclaimerAcknowledged).toBe(true);
  });
});
