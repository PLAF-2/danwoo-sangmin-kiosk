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
import { MAX_IMAGE_BYTES } from '../storage/imageValidation';
import type { UserDataPaths } from '../storage/paths';
import { registerBackupIpc } from './backupIpc';
import { registerCatalogIpc } from './catalogIpc';
import { createConsistencyLock } from './consistencyLock';
import { catalogDataSchema } from './schemas';
import { createTestIpcEvent, createTestIpcMain, createTestIpcSecurity } from './testHelpers';

const directories: string[] = [];

function png(width = 1, height = 1): Buffer {
  if (width !== 1 || height !== 1) throw new Error('Missing PNG test fixture');
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgZGL+DwABFAEG9O6t0QAAAABJRU5ErkJggg==',
    'base64',
  );
}

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
  await writeFile(join(paths.imagesDirectory, 'owned.png'), png());
  return paths;
}

function registerAuthorizedBackup(
  ipcMain: ReturnType<typeof createTestIpcMain>,
  paths: UserDataPaths,
  dialog: Omit<Parameters<typeof registerBackupIpc>[0]['dialog'], 'showMessageBox'> &
    Partial<Pick<Parameters<typeof registerBackupIpc>[0]['dialog'], 'showMessageBox'>>,
  fileOperations?: Parameters<typeof registerBackupIpc>[0]['fileOperations'],
  exportLimits?: Parameters<typeof registerBackupIpc>[0]['exportLimits'],
) {
  const security = createTestIpcSecurity();
  const event = createTestIpcEvent();
  security.createAdminSession(event);
  registerBackupIpc({
    ipcMain,
    paths,
    dialog: {
      ...dialog,
      showMessageBox: dialog.showMessageBox ?? vi.fn().mockResolvedValue({ response: 0 }),
    },
    security,
    ...(fileOperations ? { fileOperations } : {}),
    ...(exportLimits ? { exportLimits } : {}),
  });
  return event;
}

describe('backup IPC', () => {
  it('asks for confirmation after validation and cancellation leaves JSON and images untouched', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'cancelled-valid.json');
    const restoredCatalog = createCatalogData({
      products: [{
        ...createCatalogData().products[0]!,
        thumbnailImage: 'images/replacement.png',
        detailImages: ['images/replacement.png'],
      }],
    });
    await writeFile(importFile, JSON.stringify({
      version: 1,
      catalog: restoredCatalog,
      settings: createAppSettings({ welcomeMessage: 'must not be restored' }),
      payment: createPaymentSettings({ pickupMessage: 'must not be restored' }),
      images: [{ path: 'images/replacement.png', contentBase64: png().toString('base64') }],
    }));
    const beforeCatalog = await readFile(paths.catalogFile, 'utf8');
    const beforeSettings = await readFile(paths.settingsFile, 'utf8');
    const beforePayment = await readFile(paths.paymentFile, 'utf8');
    const beforeImages = await readdir(paths.imagesDirectory);
    const showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
      showMessageBox,
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).resolves.toBeUndefined();
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      message: expect.stringContaining('1'),
      buttons: expect.any(Array),
    }));
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toBe(beforeCatalog);
    await expect(readFile(paths.settingsFile, 'utf8')).resolves.toBe(beforeSettings);
    await expect(readFile(paths.paymentFile, 'utf8')).resolves.toBe(beforePayment);
    await expect(readdir(paths.imagesDirectory)).resolves.toEqual(beforeImages);
    expect((await readdir(paths.userData)).some((name) => name.startsWith('.highest-restore-'))).toBe(false);
  });

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
      { path: 'images/owned.png', contentBase64: png().toString('base64') },
    ]);
  });

  it('stops export traversal before reading an oversized image', async () => {
    const paths = await setupPaths();
    const backupFile = join(paths.userData, 'oversized-export.json');
    await writeFile(join(paths.imagesDirectory, 'oversized.png'), Buffer.alloc(65));
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(
      ipcMain,
      paths,
      {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: backupFile }),
        showOpenDialog: vi.fn(),
      },
      undefined,
      { maxImageBytes: 64 },
    );

    await expect(ipcMain.invokeFrom(event, 'admin:export-backup')).rejects.toThrow('too large');
    await expect(readFile(backupFile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stops export traversal when the image count limit is exceeded', async () => {
    const paths = await setupPaths();
    const backupFile = join(paths.userData, 'many-export.json');
    await writeFile(join(paths.imagesDirectory, 'second.png'), png());
    await writeFile(join(paths.imagesDirectory, 'third.png'), png());
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(
      ipcMain,
      paths,
      {
        showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: backupFile }),
        showOpenDialog: vi.fn(),
      },
      undefined,
      { maxImageCount: 2 },
    );

    await expect(ipcMain.invokeFrom(event, 'admin:export-backup')).rejects.toThrow('count limit');
    await expect(readFile(backupFile)).rejects.toMatchObject({ code: 'ENOENT' });
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

  it('rejects image paths that collide under Windows case-insensitive semantics', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'duplicate-case.json');
    const catalog = createCatalogData({
      products: [
        {
          ...createCatalogData().products[0]!,
          thumbnailImage: 'images/Product.png',
          detailImages: ['images/product.png'],
        },
      ],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: [
          { path: 'images/Product.png', contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
          { path: 'images/product.png', contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' },
        ],
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow('duplicate path');
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
            contentBase64: png().toString('base64'),
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
      readFile(join(paths.imagesDirectory, 'products', 'replacement.png')),
    ).resolves.toEqual(png());
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
        images: [{ path: 'images/new.png', contentBase64: png().toString('base64') }],
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
    const userDataEntries = await readdir(paths.userData);
    expect(userDataEntries.filter((name) => name.startsWith('.highest-restore-'))).toEqual([]);
  });

  it('serializes a restore with concurrent catalog reads and saves', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'concurrent-restore.json');
    const restoredCatalog = createCatalogData({
      products: [{ ...createCatalogData().products[0]!, name: 'restored', thumbnailImage: 'images/new.png', detailImages: ['images/new.png'] }],
    });
    const savedCatalog = createCatalogData({
      products: [{ ...createCatalogData().products[0]!, name: 'saved-after-restore' }],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog: restoredCatalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: [{ path: 'images/new.png', contentBase64: png().toString('base64') }],
      }),
    );
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    const consistencyLock = createConsistencyLock();
    security.createAdminSession(event);
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    let signalCommitStarted!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      signalCommitStarted = resolve;
    });
    let renameCalls = 0;
    registerBackupIpc({
      ipcMain,
      paths,
      security,
      consistencyLock,
      dialog: {
        showSaveDialog: vi.fn(),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
        showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      },
      fileOperations: {
        rename: async (from, to) => {
          renameCalls += 1;
          if (renameCalls === 1) {
            signalCommitStarted();
            await commitGate;
          }
          await rename(from, to);
        },
      },
    });
    registerCatalogIpc({ ipcMain, catalogFile: paths.catalogFile, security, consistencyLock });

    const restore = ipcMain.invokeFrom(event, 'admin:import-backup');
    await commitStarted;
    let readSettled = false;
    let saveSettled = false;
    const read = ipcMain.invokeFrom(event, 'catalog:read').finally(() => {
      readSettled = true;
    });
    const save = ipcMain.invokeFrom(event, 'catalog:save', savedCatalog).finally(() => {
      saveSettled = true;
    });
    await Promise.resolve();
    expect({ readSettled, saveSettled }).toEqual({ readSettled: false, saveSettled: false });

    releaseCommit();
    await restore;
    await expect(read).resolves.toEqual(restoredCatalog);
    await expect(save).resolves.toBeUndefined();
    await expect(
      createAtomicJsonStore({ filePath: paths.catalogFile, schema: catalogDataSchema }).read(),
    ).resolves.toEqual(savedCatalog);
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

  it('preserves the restore journal and originals when an import rollback fails', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'rollback-failure.json');
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
        images: [{ path: 'images/new.png', contentBase64: png().toString('base64') }],
      }),
    );
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
          if (renameCalls === 4) throw new Error('injected commit failure');
          await rename(from, to);
        },
        rm: async (path, options) => {
          if (path === paths.catalogFile) throw new Error('injected rollback failure');
          await rm(path, options);
        },
      },
    );

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow(
      'Restore commit and rollback failed',
    );
    const [transactionName] = (await readdir(paths.userData)).filter((name) =>
      name.startsWith('.highest-restore-'),
    );
    expect(transactionName).toBeTruthy();
    const transactionRoot = join(paths.userData, transactionName!);
    await expect(readFile(join(transactionRoot, 'restore-manifest.json'), 'utf8')).resolves.toContain(
      '"status": "prepared"',
    );
    await expect(readFile(join(transactionRoot, 'rollback', 'catalog.json'), 'utf8')).resolves.toContain(
      'owned.png',
    );
  });

  it.each([
    ['renamed raster', 'images/replacement.png', Buffer.from('not-an-image')],
    [
      'unsafe SVG',
      'images/replacement.svg',
      Buffer.from('<svg viewBox="0 0 1 1" onload="alert(1)"><script/></svg>'),
    ],
  ])('rejects %s content before staging', async (_label, imagePath, content) => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'unsafe-media.json');
    const catalog = createCatalogData({
      products: [
        {
          ...createCatalogData().products[0]!,
          thumbnailImage: imagePath,
          detailImages: [imagePath],
        },
      ],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: [{ path: imagePath, contentBase64: content.toString('base64') }],
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow();
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toContain('owned.png');
  });

  it('imports a bounded sanitized SVG from a backup', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'safe-svg.json');
    const imagePath = 'images/replacement.svg';
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>');
    const catalog = createCatalogData({
      products: [
        {
          ...createCatalogData().products[0]!,
          thumbnailImage: imagePath,
          detailImages: [imagePath],
        },
      ],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: [{ path: imagePath, contentBase64: svg.toString('base64') }],
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).resolves.toBeUndefined();
    await expect(readFile(join(paths.imagesDirectory, 'replacement.svg'))).resolves.toEqual(svg);
  });

  it('rejects an image exceeding the per-image backup limit before decoding', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'oversized-image.json');
    const imagePath = 'images/oversized.png';
    const catalog = createCatalogData({
      products: [
        {
          ...createCatalogData().products[0]!,
          thumbnailImage: imagePath,
          detailImages: [imagePath],
        },
      ],
    });
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: [
          {
            path: imagePath,
            contentBase64: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64'),
          },
        ],
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow();
    expect((await readdir(paths.userData)).some((name) => name.startsWith('.highest-restore-'))).toBe(false);
  });

  it('rejects an over-count backup before decoding images or creating restore artifacts', async () => {
    const paths = await setupPaths();
    const importFile = join(paths.userData, 'too-many-images.json');
    const catalog = createCatalogData();
    catalog.products[0] = {
      ...catalog.products[0]!,
      thumbnailImage: 'images/image-0.png',
      detailImages: ['images/image-0.png'],
    };
    await writeFile(
      importFile,
      JSON.stringify({
        version: 1,
        catalog,
        settings: createAppSettings(),
        payment: createPaymentSettings(),
        images: Array.from({ length: 501 }, (_, index) => ({
          path: `images/image-${index}.png`,
          contentBase64: 'AA==',
        })),
      }),
    );
    const ipcMain = createTestIpcMain();
    const event = registerAuthorizedBackup(ipcMain, paths, {
      showSaveDialog: vi.fn(),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [importFile] }),
    });

    await expect(ipcMain.invokeFrom(event, 'admin:import-backup')).rejects.toThrow(
      'backup image count limit exceeded',
    );
    expect((await readdir(paths.userData)).some((name) => name.startsWith('.highest-restore-'))).toBe(false);
    await expect(readFile(paths.catalogFile, 'utf8')).resolves.toContain('owned.png');
  });
});
