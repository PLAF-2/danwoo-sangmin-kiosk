import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

async function expectUserDataUntouched(userData: string): Promise<void> {
  expect(await readdir(userData)).toEqual([]);
}

async function createDirectoryLink(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOSYS'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      return false;
    }
    throw error;
  }
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

  it('rejects a traversing default image reference before touching user data', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    const settingsPath = join(defaultsDirectory, 'settings.json');
    const settings = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
    settings.welcomeBackgroundImage = 'images/../../outside.svg';
    await writeFile(settingsPath, JSON.stringify(settings));

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow('Unsafe image path');

    await expectUserDataUntouched(userData);
  });

  it('rejects a missing referenced default image before touching user data', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    await rm(join(defaultsDirectory, 'images', 'horizon-album.svg'));

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow('Referenced default image');

    await expectUserDataUntouched(userData);
  });

  it('rejects a missing default images directory before touching user data', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    await rm(join(defaultsDirectory, 'images'), { recursive: true });

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow();

    await expectUserDataUntouched(userData);
  });

  it('rejects linked entries in the source image tree before touching user data', async (context) => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    const outsideDirectory = await makeTemporaryDirectory('highest-outside-');
    await copyFixtureDefaults(defaultsDirectory);
    await writeFile(join(outsideDirectory, 'outside.svg'), '<svg/>');
    const linkedDirectory = join(defaultsDirectory, 'images', 'linked');

    if (!(await createDirectoryLink(outsideDirectory, linkedDirectory))) {
      context.skip('OS privileges do not permit creating a directory link');
      return;
    }

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow('link');
    await expectUserDataUntouched(userData);
  });

  it('rejects an existing linked destination image directory without writing outside', async (context) => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    const outsideDirectory = await makeTemporaryDirectory('highest-outside-');
    await copyFixtureDefaults(defaultsDirectory);
    const linkedImagesDirectory = join(userData, 'images');

    if (!(await createDirectoryLink(outsideDirectory, linkedImagesDirectory))) {
      context.skip('OS privileges do not permit creating a directory link');
      return;
    }

    await expect(
      initializeUserData({ app: { getPath: () => userData }, defaultsDirectory }),
    ).rejects.toThrow('link');
    expect(await readdir(outsideDirectory)).toEqual([]);
    expect(await readdir(userData)).toEqual(['images']);
  });

  it('supports concurrent first-run initialization without replacing published data', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    const options = { app: { getPath: () => userData }, defaultsDirectory };

    await Promise.all([initializeUserData(options), initializeUserData(options)]);

    expect(JSON.parse(await readFile(join(userData, 'catalog.json'), 'utf8'))).toHaveProperty(
      'products',
    );
    expect(await readFile(join(userData, 'images', 'horizon-album.svg'), 'utf8')).toContain(
      '<svg',
    );
    expect((await readdir(userData)).sort()).toEqual([
      'catalog.json',
      'images',
      'payment.json',
      'settings.json',
    ]);
  });

  it('recovers a complete image on the launch after interrupted image publication', async () => {
    const userData = await makeTemporaryDirectory('highest-user-data-');
    const defaultsDirectory = await makeTemporaryDirectory('highest-defaults-');
    await copyFixtureDefaults(defaultsDirectory);
    let shouldInterrupt = true;

    await expect(
      initializeUserData({
        app: { getPath: () => userData },
        defaultsDirectory,
        dependencies: {
          imageInstall: {
            link: async () => {
              if (shouldInterrupt) {
                shouldInterrupt = false;
                throw new Error('injected image publication failure');
              }
            },
          },
        },
      }),
    ).rejects.toThrow('injected image publication failure');
    expect(await readdir(join(userData, 'images'))).toEqual([]);

    await initializeUserData({ app: { getPath: () => userData }, defaultsDirectory });

    expect(await readFile(join(userData, 'images', 'horizon-album.svg'), 'utf8')).toContain(
      '<svg',
    );
  });
});
