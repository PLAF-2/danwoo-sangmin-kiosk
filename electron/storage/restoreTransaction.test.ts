import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { UserDataPaths } from './paths';
import { prepareRestoreTransaction, recoverPendingRestores } from './restoreTransaction';

const directories: string[] = [];

async function setupTransaction() {
  const root = await mkdtemp(join(tmpdir(), 'highest-restore-recovery-'));
  directories.push(root);
  const userData = join(root, 'user-data');
  const paths: UserDataPaths = {
    userData,
    catalogFile: join(userData, 'catalog.json'),
    settingsFile: join(userData, 'settings.json'),
    paymentFile: join(userData, 'payment.json'),
    imagesDirectory: join(userData, 'images'),
    ordersDirectory: join(userData, 'orders'),
    adminCredentialsFile: join(userData, 'admin-credentials.json'),
  };
  await mkdir(paths.imagesDirectory, { recursive: true });
  await Promise.all([
    writeFile(paths.catalogFile, 'old-catalog'),
    writeFile(paths.settingsFile, 'old-settings'),
    writeFile(paths.paymentFile, 'old-payment'),
    writeFile(join(paths.imagesDirectory, 'old.png'), 'old-image'),
  ]);
  const transactionRoot = await mkdtemp(join(userData, '.highest-restore-'));
  const stage = join(transactionRoot, 'stage');
  await mkdir(join(stage, 'images'), { recursive: true });
  await Promise.all([
    writeFile(join(stage, 'catalog.json'), 'new-catalog'),
    writeFile(join(stage, 'settings.json'), 'new-settings'),
    writeFile(join(stage, 'payment.json'), 'new-payment'),
    writeFile(join(stage, 'images', 'new.png'), 'new-image'),
  ]);
  await prepareRestoreTransaction({ paths, transactionRoot });
  const rollback = join(transactionRoot, 'rollback');
  const operations = [
    [paths.catalogFile, join(rollback, 'catalog.json')],
    [join(stage, 'catalog.json'), paths.catalogFile],
    [paths.settingsFile, join(rollback, 'settings.json')],
    [join(stage, 'settings.json'), paths.settingsFile],
    [paths.paymentFile, join(rollback, 'payment.json')],
    [join(stage, 'payment.json'), paths.paymentFile],
    [paths.imagesDirectory, join(rollback, 'images')],
    [join(stage, 'images'), paths.imagesDirectory],
  ] as const;
  return { paths, transactionRoot, operations };
}

async function expectOriginals(paths: UserDataPaths): Promise<void> {
  await expect(readFile(paths.catalogFile, 'utf8')).resolves.toBe('old-catalog');
  await expect(readFile(paths.settingsFile, 'utf8')).resolves.toBe('old-settings');
  await expect(readFile(paths.paymentFile, 'utf8')).resolves.toBe('old-payment');
  await expect(readFile(join(paths.imagesDirectory, 'old.png'), 'utf8')).resolves.toBe('old-image');
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('restore transaction recovery', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'rolls back a process termination after swap operation %s',
    async (operationCount) => {
      const { paths, transactionRoot, operations } = await setupTransaction();
      await mkdir(join(transactionRoot, 'rollback'), { recursive: true });
      for (const [from, to] of operations.slice(0, operationCount)) await rename(from, to);

      await recoverPendingRestores(paths);

      await expectOriginals(paths);
      await expect(readFile(join(transactionRoot, 'restore-manifest.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('preserves the journal and rollback originals when recovery itself fails', async () => {
    const { paths, transactionRoot, operations } = await setupTransaction();
    await mkdir(join(transactionRoot, 'rollback'), { recursive: true });
    for (const [from, to] of operations.slice(0, 2)) await rename(from, to);

    await expect(
      recoverPendingRestores(paths, {
        rm: async (path, options) => {
          if (path === paths.catalogFile) throw new Error('injected rollback failure');
          await rm(path, options);
        },
      }),
    ).rejects.toThrow('injected rollback failure');

    await expect(readFile(join(transactionRoot, 'restore-manifest.json'), 'utf8')).resolves.toContain(
      '"version": 1',
    );
    await expect(readFile(join(transactionRoot, 'rollback', 'catalog.json'), 'utf8')).resolves.toBe(
      'old-catalog',
    );
  });
});
