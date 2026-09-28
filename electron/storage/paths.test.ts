import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createUserDataPaths, resolveImagePath } from './paths';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('user data paths', () => {
  it('places JSON and images beneath Electron userData', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'highest-paths-'));
    temporaryDirectories.push(userData);

    const paths = createUserDataPaths({ getPath: () => userData });

    expect(paths).toEqual({
      userData,
      catalogFile: join(userData, 'catalog.json'),
      settingsFile: join(userData, 'settings.json'),
      paymentFile: join(userData, 'payment.json'),
      imagesDirectory: join(userData, 'images'),
      ordersDirectory: join(userData, 'orders'),
      adminCredentialsFile: join(userData, 'admin-credentials.json'),
    });
    expect(resolveImagePath(paths, 'images/product.svg')).toBe(
      join(userData, 'images', 'product.svg'),
    );
  });

  it.each([
    'https://example.public.blob.vercel-storage.com/products/album.png',
    '../outside.svg',
    'images/../../outside.svg',
    'images\\..\\outside.svg',
    'not-images/product.svg',
    'C:\\outside.svg',
    '\\\\server\\share\\outside.svg',
  ])('rejects an unsafe image path: %s', async (unsafePath) => {
    const userData = await mkdtemp(join(tmpdir(), 'highest-paths-'));
    temporaryDirectories.push(userData);
    const paths = createUserDataPaths({ getPath: () => userData });

    expect(() => resolveImagePath(paths, unsafePath)).toThrow('Unsafe image path');
  });
});
