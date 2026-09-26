import {
  lstat as nodeLstat,
  mkdir,
  mkdtemp as nodeMkdtemp,
  open,
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
import {
  MAX_IMAGE_BYTES,
  readBoundedRegularFile,
  validateImageContent,
} from '../storage/imageValidation';
import {
  commitRestoreTransaction,
  prepareRestoreTransaction,
} from '../storage/restoreTransaction';
import type { UserDataPaths } from '../storage/paths';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { createConsistencyLock, type ConsistencyLock } from './consistencyLock';
import type { IpcSecurity } from './ipcSecurity';
import { catalogDataSchema } from './schemas';

const allowedImageExtensions = new Set(['.jpeg', '.jpg', '.png', '.svg', '.webp']);
const maxBackupImageBytes = 50 * 1024 * 1024;
const maxBackupImageCount = 500;
const maxBackupFileBytes = 80 * 1024 * 1024;
const maxBase64Length = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
const base64Schema = z
  .string()
  .max(maxBase64Length)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u, 'invalid base64');

function decodedBase64Length(value: string): number {
  return (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}

const backupImageSchema = z
  .object({ path: ownedImagePathSchema, contentBase64: base64Schema })
  .strict();

const backupSchema = z
  .object({
    version: z.literal(1),
    catalog: catalogDataSchema,
    settings: appSettingsSchema,
    payment: paymentSettingsSchema,
    images: z.array(backupImageSchema).max(maxBackupImageCount, 'backup image count limit exceeded'),
  })
  .strict()
  .superRefine((backup, context) => {
    const imagePaths = new Set<string>();
    let totalImageBytes = 0;
    for (const [index, image] of backup.images.entries()) {
      const pathKey = image.path.toLocaleLowerCase('en-US');
      if (imagePaths.has(pathKey)) {
        context.addIssue({ code: 'custom', path: ['images', index, 'path'], message: 'duplicate path' });
      }
      imagePaths.add(pathKey);
      totalImageBytes += decodedBase64Length(image.contentBase64);
      if (totalImageBytes > maxBackupImageBytes) {
        context.addIssue({ code: 'custom', path: ['images'], message: 'backup image total is too large' });
        break;
      }
    }
    const references = [
      backup.settings.welcomeBackgroundImage,
      backup.payment.qrImage,
      ...backup.catalog.products.flatMap((product) => [product.thumbnailImage, ...product.detailImages]),
    ].filter(Boolean);
    for (const reference of references) {
      if (!imagePaths.has(reference.toLocaleLowerCase('en-US'))) {
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

async function listImages(
  directory: string,
  root = directory,
  usage = { count: 0, bytes: 0 },
  limits = {
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTotalBytes: maxBackupImageBytes,
    maxImageCount: maxBackupImageCount,
  },
): Promise<Backup['images']> {
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
    const stats = await nodeLstat(path);
    if (entry.isSymbolicLink() || stats.isSymbolicLink()) {
      throw new Error(`Image directory contains a link: ${path}`);
    }
    if (entry.isDirectory() && stats.isDirectory()) {
      images.push(...(await listImages(path, root, usage, limits)));
      continue;
    }
    if (!entry.isFile() || !stats.isFile()) throw new Error(`Image path is not a regular file: ${path}`);
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const imagePath = ownedImagePathSchema.parse(`images/${relativePath}`);
    if (!allowedImageExtensions.has(extname(imagePath).toLowerCase())) {
      throw new Error(`Unsupported image in user data: ${imagePath}`);
    }
    usage.count += 1;
    usage.bytes += stats.size;
    if (usage.count > limits.maxImageCount) throw new Error('Backup image count limit exceeded');
    if (stats.size > limits.maxImageBytes) throw new Error(`Backup image is too large: ${imagePath}`);
    if (usage.bytes > limits.maxTotalBytes) throw new Error('Backup image total is too large');
    const content = await readBoundedRegularFile(path, limits.maxImageBytes, 'Backup image');
    await validateImageContent(content, imagePath, { allowSvg: true });
    images.push({ path: imagePath, contentBase64: content.toString('base64') });
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

export function registerBackupIpc({
  ipcMain,
  paths,
  dialog,
  security,
  consistencyLock = createConsistencyLock(),
  exportLimits: exportLimitOverrides,
  fileOperations: fileOperationOverrides,
}: {
  ipcMain: IpcMainLike;
  paths: UserDataPaths;
  dialog: BackupDialogLike;
  security: IpcSecurity;
  consistencyLock?: ConsistencyLock;
  exportLimits?: Partial<{
    maxImageBytes: number;
    maxTotalBytes: number;
    maxImageCount: number;
  }>;
  fileOperations?: Partial<BackupFileOperations>;
}): void {
  const fileOperations = { ...defaultFileOperations, ...fileOperationOverrides };
  const exportLimits = {
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTotalBytes: maxBackupImageBytes,
    maxImageCount: maxBackupImageCount,
    ...exportLimitOverrides,
  };
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
    return consistencyLock.withRead(async () => {
      const backup = backupSchema.parse({
        version: 1,
        catalog: await catalogStore.read(),
        settings: await settingsStore.read(),
        payment: await paymentStore.read(),
        images: await listImages(paths.imagesDirectory, paths.imagesDirectory, { count: 0, bytes: 0 }, exportLimits),
      });
      await createAtomicJsonStore({ filePath: result.filePath!, schema: backupSchema }).write(backup);
      return result.filePath!;
    });
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
    return consistencyLock.withWrite(async () => {
      const sourceStats = await fileOperations.lstat(filePath);
      if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
        throw new Error('Backup must be a regular file');
      }

      const backup = backupSchema.parse(
        JSON.parse((await readBoundedRegularFile(filePath, maxBackupFileBytes, 'Backup')).toString('utf8')),
      );
      const decodedImages: Array<{ path: string; content: Buffer }> = [];
      for (const image of backup.images) {
        const content = Buffer.from(image.contentBase64, 'base64');
        await validateImageContent(content, image.path, { allowSvg: true });
        decodedImages.push({ path: image.path, content });
      }
      const transactionRoot = await fileOperations.mkdtemp(join(paths.userData, '.highest-restore-'));
      const stage = join(transactionRoot, 'stage');
      const restoreFileOperations = {
        lstat: fileOperations.lstat,
        rename: fileOperations.rename,
        rm: fileOperations.rm,
      };
      let journaled = false;
      try {
        await createAtomicJsonStore({ filePath: join(stage, 'catalog.json'), schema: catalogDataSchema }).write(backup.catalog);
        await createAtomicJsonStore({ filePath: join(stage, 'settings.json'), schema: appSettingsSchema }).write(backup.settings);
        await createAtomicJsonStore({ filePath: join(stage, 'payment.json'), schema: paymentSettingsSchema }).write(backup.payment);
        await mkdir(join(stage, 'images'), { recursive: true });
        for (const image of decodedImages) {
          const relativeImagePath = image.path.slice('images/'.length);
          await writeBufferAtomic(join(stage, 'images', ...relativeImagePath.split('/')), image.content);
        }
        await prepareRestoreTransaction({ paths, transactionRoot, fileOperations: restoreFileOperations });
        journaled = true;
        await commitRestoreTransaction({ paths, transactionRoot, fileOperations: restoreFileOperations });
      } catch (error) {
        if (!journaled) {
          await fileOperations.rm(transactionRoot, { recursive: true, force: true });
        }
        throw error;
      }
    });
  });
}
