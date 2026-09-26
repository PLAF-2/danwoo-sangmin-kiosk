import { describe, expect, it } from 'vitest';

import { toKioskMediaUrl } from './kioskApi';

describe('toKioskMediaUrl', () => {
  it('converts a safe stored image path to an encoded kiosk-media URL', () => {
    expect(toKioskMediaUrl('images/products/album cover.png')).toBe(
      'kiosk-media://images/products/album%20cover.png',
    );
    expect(toKioskMediaUrl('')).toBe('');
  });

  it.each(['../secret.png', 'images/../../secret.png', 'other/image.png', 'C:\\secret.png', 'images/file.txt'])(
    'rejects unsafe stored path %s',
    (path) => expect(() => toKioskMediaUrl(path)).toThrow('Unsafe kiosk media path'),
  );
});
