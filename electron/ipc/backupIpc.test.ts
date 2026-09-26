import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appSettingsSchema, paymentSettingsSchema } from '../../src/domain';
import {
  createAppSettings,
  createCatalogData,
  createPaymentSettings,
} from '../../src/test/fixtures';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import type { UserDataPaths } from '../storage/paths';
import { registerBackupIpc } from './backupIpc';
import { catalogDataSchema } from './schemas';
import { createTestIpcEvent, createTestIpcMain, createTestIpcSecurity } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function setupPaths(): Promise<UserDataPaths> {
  const userData = await mkdtemp(join(tmpdir(), 'highest-backup-'));
  directories.push(userData);
  const paths: UserDataPaths = {
    userData,
    catalogFile: join(userData, 'catalog.json'),
    settingsFile: join(userData, 'settings.json'),
    paymentFile: join(userData, 'payment.json'),
    imagesDirectory: join(userData, 'images'),
    ordersDirectory: join(userData, 'orders'),
    adminCredentialsFile: join(userData, 'admin-credentials.json'),
  };
  const catalog = createCatalogData();
  catalog.products[0] = {
    ...catalog.products[0]!,
    thumbnailImage: 'images/owned.png',
    detailImages: ['images/owned.png'],
  };
  await createAtomicJsonStore({ filePath: paths.catalogFile, schema: catalogDataSchema }).write(catalog);
  await createAtomicJsonStore({ filePath: paths.settingsFile, schema: appSettingsSchema }).write(
    createAppSettings(),
  );
  await createAtomicJsonStore({ filePath: paths.paymentFile, schema: paymentSettingsSchema }).write(
    createPaymentSettings(),
  );
  await mkdir(paths.imagesDirectory, { recursive: true });
  await writeFile(join(paths.imagesDirectory, 'owned.png'), Buffer.from('owned-image'));
  return paths;
}

function registerAuthorizedBackup(
  ipcMain: ReturnType<typeof createTestIpcMain>,
  paths: UserDataPaths,
  dialog: Parameters<typeof registerBackupIpc>[0]['dialog'],
  fileOperations?: Parameters<typeof registerBackupIpc>[0]['fileOperations'],
) {
  const security = createTestIpcSecurity();
  const event = createTestIpcEvent();
  security.createAdminSession(event);
  registerBackupIpc({ ipcMain, paths, dialog, security, ...(fileOperations ? { fileOperations } : {}) });
  return event;
}

describe('backup IPC', () => {
  it('exports validated JSON data and owned images', async () => {
    const paths = await setupPaths();
    const backupFile = join(paths.userData, 'export.highest-backup.json');
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: backupFile }),
        showOpenDialog: vi.fn(),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:export-backup')).resolves.toBe(backupFile);
    const backup = JSON.parse(await readFile(backupFile, 'utf8')) as {
      version: number;
      catalog: unknown;
      settings: unknown;
      payment: unknown;
      images: Array<{ path: string; contentBase64: string }>;
    };
    expect(backup).toMatchObject({
      version: 1,
      catalog: {
        ...createCatalogData(),
        products: [
          {
            ...createCatalogData().products[0],
            thumbnailImage: 'images/owned.png',
            detailImages: ['images/owned.png'],
          },
        ],
      },
      settings: createAppSettings(),
      payment: createPaymentSettings(),
    });
    expect(backup.images).toEqual([
      { path: 'images/owned.png', contentBase64: Buffer.from('owned-image').toString('base64') },
    ]);
  });

  it('validates the entire import before mutation and preserves current data on failure', async () => {
    const paths = await setupPaths();
    const invalidBackup = join(paths.userData, 'invalid.json');
    await writeFile(
      invalidBackup,
      JSON.stringify({
        version: 1,
        catalog: { ...createCatalogData(), extra: true },
        settings: createAppSettings({ welcomeMessage: 'must not be written' }),
        payment: createPaymentSettings(),
        images: [{ path: '../escape.png', contentBase64: 'bm90LXJlYWw=' }],
      }),
    );
    const beforeCatalog = await readFile(paths.catalogFile, 'utf8');
    const beforeSettings = await readFile(paths.settingsFile, 'utf8');
    const beforeImage = await readFile(join(paths.imagesDirectory, 'owned.png'));
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi
          .fn()
          .mockResolvedValue({ canceled: false, filePaths: [invalidBackup] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow();
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toBe(beforeCatalog);
    await expect(readFile(paths.settingsFile, 'utf8')).resolves.toBe(beforeSettings);
    await expect(readFile(join(paths.imagesDirectory, 'owned.png'))).resolves.toEqual(beforeImage);
  });

  it('imports a fully validated backup including nested owned images', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'valid.json');
    const catalog = createCatalogData();
    catalog.products[0] = {
      ...catalog.products[0]!,
      thumbnailImage: 'images/products/replacement.png',
      detailImages: ['images/products/replacement.png'],
    };
    const settings = createAppSettings({ welcomeMessage: 'restored message' });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings,
        payment: createPaymentSettings(),
        images: [
          {
            path: 'images/products/replacement.png',
            contentBase64: Buffer.from('replacement-image').toString('base64'),
          },
        ],
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).resolves.toBeUndefined();
    await expect(
      createAtomicJsonStore({ filePath: paths.catalogFile, schema: catalogDataSchema }).read(),
    ).resolves.toEqual(catalog);
    await expect(
      createAtomicJsonStore({ filePath: paths.settingsFile, schema: appSettingsSchema }).read(),
    ).resolves.toEqual(settings);
    await expect(
      readFile(join(paths.imagesDirectory, 'products', 'replacement.png'), 'utf8'),
    ).resolves.toBe('replacement-image');
  });

  it('returns without mutation when either dialog is cancelled and rejects extra arguments', async () => {
    const paths = await setupPaths();
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:export-backup')).resolves.toBeNull();
    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).resolves.toBeUndefined();
    await expect(ipcMain.invokeFrom(event, 'admin:import-backup', 'unexpected')).rejects.toThrow();
  });

  it('rolls back every target and cleans artifacts when a mid-commit rename fails', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'rollback.json');
    const restoredCatalog = createCatalogData({
      products: [
        {
          ...createCatalogData().products[0]!,
          thumbnailImage: 'images/new.png',
          detailImages: ['images/new.png'],
        },
      ],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog: restoredCatalog,
        settings: createAppSettings({ welcomeMessage: 'new' }),
        payment: createPaymentSettings(),
        images: [{ path: 'images/new.png', contentBase64: Buffer.from('new-image').toString('base64') }],
      }),
    );
    const beforeCatalog = await readFile(paths.catalogFile, 'utf8');
    const beforeSettings = await readFile(paths.settingsFile, 'utf8');
    const beforePayment = await readFile(paths.paymentFile, 'utf8');
    const beforeImage = await readFile(join(paths.imagesDirectory, 'owned.png'));
    let renameCalls = 0;
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(
      ipcMain,
      paths,
      {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
      },
      {
        rename: async (from, to) => {
          renameCalls += 1;
          if (renameCalls === 4) throw new Error('injected rename failure');
          await rename(from, to);
        },
      },
    );

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow(
      'injected rename failure',
    );
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toBe(beforeCatalog);
    await expect(readFile(paths.settingsFile, 'utf8')).resolves.toBe(beforeSettings);
    await expect(readFile(paths.paymentFile, 'utf8')).resolves.toBe(beforePayment);
    await expect(readFile(join(paths.imagesDirectory, 'owned.png'))).resolves.toEqual(beforeImage);
    await expect(readFile(join(paths.imagesDirectory, 'new.png'))).rejects.toMatchObject({ code: 'ENOENT' });
    const siblings = await readdir(join(paths.userData, '..'));
    expect(siblings.filter((name) => name.startsWith('.highest-restore-'))).toEqual([]);
  });

  it('rejects a selected backup link before reading or mutating user data', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'linked.json');
    const beforeCatalog = await readFile(paths.catalogFile, 'utf8');
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(
      ipcMain,
      paths,
      {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
      },
      {
        lstat: vi.fn().mockResolvedValue({ isFile: () => true, isSymbolicLink: () => true }),
      },
    );

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow(
      'Backup must be a regular file',
    );
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toBe(beforeCatalog);
  });
});
