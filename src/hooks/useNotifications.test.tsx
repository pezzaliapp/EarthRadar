import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationsControls } from './useNotifications';

describe('useNotificationsControls', () => {
  let originalNotification: typeof Notification | undefined;

  beforeEach(() => {
    originalNotification = (window as unknown as { Notification?: typeof Notification }).Notification;
  });

  afterEach(() => {
    if (originalNotification === undefined) {
      delete (window as unknown as { Notification?: typeof Notification }).Notification;
    } else {
      (window as unknown as { Notification: typeof Notification }).Notification = originalNotification;
    }
    vi.unstubAllGlobals();
  });

  it('reports unsupported when Notification API is missing', () => {
    delete (window as unknown as { Notification?: typeof Notification }).Notification;
    const { result } = renderHook(() => useNotificationsControls());
    expect(result.current.permission).toBe('unsupported');
    expect(result.current.supported).toBe(false);
  });

  it('reports the current Notification.permission value', () => {
    class FakeNotification {
      static permission: 'default' | 'granted' | 'denied' = 'default';
      static requestPermission = vi.fn().mockResolvedValue('granted');
    }
    (window as unknown as { Notification: typeof FakeNotification }).Notification = FakeNotification;
    const { result } = renderHook(() => useNotificationsControls());
    expect(result.current.permission).toBe('default');
    expect(result.current.supported).toBe(true);
  });

  it('request() updates permission to granted', async () => {
    class FakeNotification {
      static permission: 'default' | 'granted' | 'denied' = 'default';
      static requestPermission = vi.fn().mockResolvedValue('granted');
    }
    (window as unknown as { Notification: typeof FakeNotification }).Notification = FakeNotification;
    const { result } = renderHook(() => useNotificationsControls());
    await act(async () => {
      const r = await result.current.request();
      expect(r).toBe('granted');
    });
    expect(result.current.permission).toBe('granted');
  });

  it('request() short-circuits when already denied', async () => {
    class FakeNotification {
      static permission: 'default' | 'granted' | 'denied' = 'denied';
      static requestPermission = vi.fn();
    }
    (window as unknown as { Notification: typeof FakeNotification }).Notification = FakeNotification;
    const { result } = renderHook(() => useNotificationsControls());
    await act(async () => {
      const r = await result.current.request();
      expect(r).toBe('denied');
    });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});
