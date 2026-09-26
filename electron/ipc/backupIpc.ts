import {
  lstat as nodeLstat,
  mkdir,
  mkdtemp as nodeMkdtemp,
  open,
  readFile,
  readdir,
  rename as nodeRename,
  rm as nodeRm,
  unlink,
} from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { z } from 'zod';

import { appSettingsSchema, ownedImagePathSchema, paymentSettingsSchema } from '../../src/domain';
import { createUniqueTemporaryPath, syncDirectoryBestEffort } from '../storage/atomicFileOperations';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import type { UserDataPaths } from '../storage/paths';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import type { IpcSecurity } from './ipcSecurity';
import { catalogDataSchema } from './schemas';

const allowedImageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const base64Schema = z.string().refine((value) => {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').toString('base64') === value;
}, 'invalid base64');

const backupImageSchema = z
  .object({ path: ownedImagePathSchema, contentBase64: base64Schema })
  .strict();

const backupSchema = z
  .object({
    version: z.literal(1),
    catalog: catalogDataSchema,
    settings: appSettingsSchema,
    payment: paymentSettingsSchema,
    images: z.array(backupImageSchema),
  })
  .strict()
  .superRefine((backup, context) => {
    const imagePaths = new Set<string>();
    for (const [index, image] of backup.images.entries()) {
      if (imagePaths.has(image.path)) {
        context.addIssue({ code: 'custom', path: ['images', index, 'path'], message: 'duplicate path' });
      }
      imagePaths.add(image.path);
    }
    const references = [
      backup.settings.welcomeBackgroundImage,
      backup.payment.qrImage,
      ...backup.catalog.products.flatMap((product) => [product.thumbnailImage, ...product.detailImages]),
    ].filter(Boolean);
    for (const reference of references) {
      if (!imagePaths.has(reference)) {
        context.addIssue({ code: 'custom', path: ['images'], message: `missing image: ${reference}` });
      }
    }
  });

type Backup = z.infer<typeof backupSchema>;

export interface BackupDialogLike {
  showSaveDialog(options: {
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(options: {
    properties: ['openFile'];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export interface BackupFileOperations {
  lstat(path: string): Promise<Pick<Stats, 'isFile' | 'isDirectory' | 'isSymbolicLink'>>;
  mkdtemp(prefix: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
}

const defaultFileOperations: BackupFileOperations = {
  lstat: nodeLstat,
  mkdtemp: nodeMkdtemp,
  rename: nodeRename,
  rm: nodeRm,
};

async function listImages(directory: string, root = directory): Promise<Backup['images']> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const images: Backup['images'] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Image directory contains a link: ${path}`);
    if (entry.isDirectory()) {
      images.push(...(await listImages(path, root)));
      continue;
    }
    if (!entry.isFile()) throw new Error(`Image path is not a regular file: ${path}`);
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const imagePath = ownedImagePathSchema.parse(`images/${relativePath}`);
    if (!allowedImageExtensions.has(extname(imagePath).toLowerCase())) {
      throw new Error(`Unsupported image in user data: ${imagePath}`);
    }
    images.push({ path: imagePath, contentBase64: (await readFile(path)).toString('base64') });
  }
  return images.sort((left, right) => left.path.localeCompare(right.path));
}

async function writeBufferAtomic(path: string, content: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = createUniqueTemporaryPath(path);
  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await nodeRename(temporaryPath, path);
    await syncDirectoryBestEffort(dirname(path));
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function pathExistsAsOwnedType(
  path: string,
  expected: 'file' | 'directory',
  fileOperations: BackupFileOperations,
): Promise<boolean> {
  try {
    const stats = await fileOperations.lstat(path);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to replace linked backup target: ${path}`);
    if (expected === 'file' ? !stats.isFile() : !stats.isDirectory()) {
      throw new Error(`Unexpected backup target type: ${path}`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function commitRestore({
  paths,
  stage,
  rollback,
  fileOperations,
}: {
  paths: UserDataPaths;
  stage: string;
  rollback: string;
  fileOperations: BackupFileOperations;
}): Promise<void> {
  const targets = [
    { live: paths.catalogFile, staged: join(stage, 'catalog.json'), saved: join(rollback, 'catalog.json'), type: 'file' as const },
    { live: paths.settingsFile, staged: join(stage, 'settings.json'), saved: join(rollback, 'settings.json'), type: 'file' as const },
    { live: paths.paymentFile, staged: join(stage, 'payment.json'), saved: join(rollback, 'payment.json'), type: 'file' as const },
    { live: paths.imagesDirectory, staged: join(stage, 'images'), saved: join(rollback, 'images'), type: 'directory' as const },
  ];
  const changes: Array<{ live: string; saved: string; originalMoved: boolean; installed: boolean }> = [];
  try {
    for (const target of targets) {
      const change = { live: target.live, saved: target.saved, originalMoved: false, installed: false };
      changes.push(change);
      await mkdir(dirname(target.saved), { recursive: true });
      if (await pathExistsAsOwnedType(target.live, target.type, fileOperations)) {
        await fileOperations.rename(target.live, target.saved);
        change.originalMoved = true;
      }
      await fileOperations.rename(target.staged, target.live);
      change.installed = true;
    }
  } catch (error) {
    for (const change of changes.reverse()) {
      if (change.installed) {
        await fileOperations.rm(change.live, { recursive: true, force: true });
      }
      if (change.originalMoved) await fileOperations.rename(change.saved, change.live);
    }
    throw error;
  }
}

export function registerBackupIpc({
  ipcMain,
  paths,
  dialog,
  security,
  fileOperations: fileOperationOverrides,
}: {
  ipcMain: IpcMainLike;
  paths: UserDataPaths;
  dialog: BackupDialogLike;
  security: IpcSecurity;
  fileOperations?: Partial<BackupFileOperations>;
}): void {
  const fileOperations = { ...defaultFileOperations, ...fileOperationOverrides };
  const catalogStore = createAtomicJsonStore({ filePath: paths.catalogFile, schema: catalogDataSchema });
  const settingsStore = createAtomicJsonStore({ filePath: paths.settingsFile, schema: appSettingsSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paths.paymentFile, schema: paymentSettingsSchema });

  ipcMain.handle(IPC_CHANNELS.backupExport, async (event, ...args) => {
    security.authorizeAdmin(event);
    z.tuple([]).parse(args);
    const result = await dialog.showSaveDialog({
      defaultPath: 'highest-kiosk-backup.json',
      filters: [{ name: 'HIGHEST Kiosk Backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const backup = backupSchema.parse({
      version: 1,
      catalog: await catalogStore.read(),
      settings: await settingsStore.read(),
      payment: await paymentStore.read(),
      images: await listImages(paths.imagesDirectory),
    });
    await createAtomicJsonStore({ filePath: result.filePath, schema: backupSchema }).write(backup);
    return result.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.backupImport, async (event, ...args) => {
    security.authorizeAdmin(event);
    z.tuple([]).parse(args);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'HIGHEST Kiosk Backup', extensions: ['json'] }],
    });
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return;
    const sourceStats = await fileOperations.lstat(filePath);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      throw new Error('Backup must be a regular file');
    }

    const backup = backupSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
    const transactionRoot = await fileOperations.mkdtemp(join(dirname(paths.userData), '.highest-restore-'));
    const stage = join(transactionRoot, 'stage');
    const rollback = join(transactionRoot, 'rollback');
    try {
      await createAtomicJsonStore({ filePath: join(stage, 'catalog.json'), schema: catalogDataSchema }).write(backup.catalog);
      await createAtomicJsonStore({ filePath: join(stage, 'settings.json'), schema: appSettingsSchema }).write(backup.settings);
      await createAtomicJsonStore({ filePath: join(stage, 'payment.json'), schema: paymentSettingsSchema }).write(backup.payment);
      await mkdir(join(stage, 'images'), { recursive: true });
      for (const image of backup.images) {
        const relativeImagePath = image.path.slice('images/'.length);
        await writeBufferAtomic(join(stage, 'images', ...relativeImagePath.split('/')), Buffer.from(image.contentBase64, 'base64'));
      }
      await commitRestore({ paths, stage, rollback, fileOperations });
    } finally {
      await fileOperations.rm(transactionRoot, { recursive: true, force: true });
    }
  });
}
