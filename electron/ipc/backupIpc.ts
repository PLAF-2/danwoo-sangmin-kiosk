import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';

import { appSettingsSchema, paymentSettingsSchema } from '../../src/domain';
import { createUniqueTemporaryPath, syncDirectoryBestEffort } from '../storage/atomicFileOperations';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import type { UserDataPaths } from '../storage/paths';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { catalogDataSchema } from './schemas';

const allowedImageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const base64Schema = z.string().refine((value) => {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').toString('base64') === value;
}, 'invalid base64');

function isSafeImagePath(value: string): boolean {
  if (value.length === 0 || isAbsolute(value) || value.includes('\\')) return false;
  const normalized = value.split('/');
  return (
    normalized.every((part) => part.length > 0 && part !== '.' && part !== '..') &&
    allowedImageExtensions.has(extname(value).toLowerCase())
  );
}

const backupImageSchema = z
  .object({
    path: z.string().refine(isSafeImagePath, 'unsafe image path'),
    contentBase64: base64Schema,
  })
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
      ...backup.catalog.products.flatMap((product) => [
        product.thumbnailImage,
        ...product.detailImages,
      ]),
    ].filter(Boolean);
    for (const reference of references) {
      if (!reference.startsWith('images/') || !imagePaths.has(reference.slice('images/'.length))) {
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
    const imagePath = relative(root, path).replaceAll('\\', '/');
    if (!isSafeImagePath(imagePath)) throw new Error(`Unsupported image in user data: ${imagePath}`);
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
    await rename(temporaryPath, path);
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
}: {
  ipcMain: IpcMainLike;
  paths: UserDataPaths;
  dialog: BackupDialogLike;
}): void {
  const catalogStore = createAtomicJsonStore({ filePath: paths.catalogFile, schema: catalogDataSchema });
  const settingsStore = createAtomicJsonStore({ filePath: paths.settingsFile, schema: appSettingsSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paths.paymentFile, schema: paymentSettingsSchema });

  ipcMain.handle(IPC_CHANNELS.backupExport, async (_event, ...args) => {
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

  ipcMain.handle(IPC_CHANNELS.backupImport, async (_event, ...args) => {
    z.tuple([]).parse(args);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'HIGHEST Kiosk Backup', extensions: ['json'] }],
    });
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return;

    // Parse and decode the complete archive before the first write. An invalid archive
    // therefore leaves every existing JSON file and owned image untouched.
    const backup = backupSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
    const decodedImages = backup.images.map((image) => ({
      path: resolve(paths.imagesDirectory, image.path),
      content: Buffer.from(image.contentBase64, 'base64'),
    }));

    for (const image of decodedImages) await writeBufferAtomic(image.path, image.content);
    await catalogStore.write(backup.catalog);
    await settingsStore.write(backup.settings);
    await paymentStore.write(backup.payment);
  });
}
