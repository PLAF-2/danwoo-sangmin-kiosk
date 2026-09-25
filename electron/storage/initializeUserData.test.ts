import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeUserData } from './initializeUserData';

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

async function copyFixtureDefaults(target: string): Promise<void> {
  const source = join(process.cwd(), 'data', 'defaults');
  const { cp } = await import('node:fs/promises');
  await cp(source, target, { recursive: true });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('initializeUserData', () => {
  it('validates and copies first-run JSON and shipped images', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);

    const paths = await initializeUserData({
      app: { getPath: () => userData },
      defaultsDirectory,
    });

    expect(JSON.parse(await readFile(paths.catalogFile, 'utf8'))).toHaveProperty('products');
    expect(JSON.parse(await readFile(paths.settingsFile, 'utf8'))).toHaveProperty(
      'welcomeMessage',
    );
    expect(JSON.parse(await readFile(paths.paymentFile, 'utf8'))).toHaveProperty('mode');
    expect(await readFile(join(paths.imagesDirectory, 'horizon-album.svg'), 'utf8')).toContain(
      '<svg',
    );
  });

  it('preserves user JSON and images when initialization runs again', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    const options = { app: { getPath: () => userData }, defaultsDirectory };
    const paths = await initializeUserData(options);
    const customizedCatalog = '{"customized":true}';
    const customizedImage = '<svg>customized</svg>';
    await writeFile(paths.catalogFile, customizedCatalog);
    await writeFile(join(paths.imagesDirectory, 'horizon-album.svg'), customizedImage);

    await initializeUserData(options);

    expect(await readFile(paths.catalogFile, 'utf8')).toBe(customizedCatalog);
    expect(await readFile(join(paths.imagesDirectory, 'horizon-album.svg'), 'utf8')).toBe(
      customizedImage,
    );
  });

  it('rejects invalid source defaults before installing any data', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await mkdir(join(defaultsDirectory, 'images'));
    await writeFile(join(defaultsDirectory, 'catalog.json'), '{"products":[]}');
    await writeFile(join(defaultsDirectory, 'settings.json'), '{}');
    await writeFile(join(defaultsDirectory, 'payment.json'), '{}');

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow();
    await expect(readFile(join(userData, 'catalog.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
