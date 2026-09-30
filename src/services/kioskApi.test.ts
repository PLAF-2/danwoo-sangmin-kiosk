import { afterEach, describe, expect, it, vi } from 'vitest';

import { toKioskMediaUrl } from './kioskApi';

describe('toKioskMediaUrl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps a hosted HTTPS image URL unchanged', () => {
    const url = 'https://example.public.blob.vercel-storage.com/products/album.png';
    expect(toKioskMediaUrl(url)).toBe(url);
  });

  it('converts a safe stored image path to an encoded same-origin URL', () => {
    expect(toKioskMediaUrl('')).toBe('');
    const path = toKioskMediaUrl('images/products/album cover.png');
    expect(path).toBe('/images/products/album%20cover.png');
    expect(new URL(path, 'https://kiosk.example/admin/products').href).toBe(
      'https://kiosk.example/images/products/album%20cover.png',
    );
  });

  it.each(['../secret.png', 'images/../../secret.png', 'other/image.png', 'C:\\secret.png', 'images/file.txt'])(
    'rejects unsafe stored path %s',
    (path) => expect(() => toKioskMediaUrl(path)).toThrow('Unsafe kiosk media path'),
  );
});
