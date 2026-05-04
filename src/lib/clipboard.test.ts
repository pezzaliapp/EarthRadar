import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, shareOrCopy, tryNativeShare } from './clipboard';

describe('tryNativeShare', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { ...navigator });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when navigator.share is missing', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    expect(await tryNativeShare({ url: 'https://x' })).toBeNull();
  });

  it('returns "shared" on success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await tryNativeShare({ url: 'https://x' })).toBe('shared');
    expect(share).toHaveBeenCalledOnce();
  });

  it('returns "cancelled" when user dismisses (AbortError)', async () => {
    const err = new DOMException('cancelled', 'AbortError');
    const share = vi.fn().mockRejectedValue(err);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await tryNativeShare({ url: 'https://x' })).toBe('cancelled');
  });

  it('returns "failed" on non-abort errors', async () => {
    const share = vi.fn().mockRejectedValue(new Error('network'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    expect(await tryNativeShare({ url: 'https://x' })).toBe('failed');
  });
});

describe('copyToClipboard', () => {
  it('uses navigator.clipboard.writeText when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    // jsdom non implementa document.execCommand: assegniamo direttamente.
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    const ok = await copyToClipboard('hello');
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });
});

describe('shareOrCopy combined strategy', () => {
  it('prefers native share when present', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    expect(await shareOrCopy({ url: 'https://x' })).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when navigator.share is missing', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    expect(await shareOrCopy({ url: 'https://x' })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x');
  });
});
