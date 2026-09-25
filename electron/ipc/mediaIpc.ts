import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';

import { copyFileIfAbsentAtomic } from '../storage/atomicFileInstall';
import { IPC_CHANNELS, type IpcMainLike } from './channels';

const allowedExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const generatedIdSchema = z.string().regex(/^[A-Za-z0-9-]+$/u);

export interface OpenDialogLike {
  showOpenDialog(options: {
    properties: ['openFile'];
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

export function registerMediaIpc({
  ipcMain,
  imagesDirectory,
  dialog,
  createId = randomUUID,
}: {
  ipcMain: IpcMainLike;
  imagesDirectory: string;
  dialog: OpenDialogLike;
  createId?: () => string;
}): void {
  const importImage = async (args: unknown[]): Promise<string | null> => {
    z.tuple([]).parse(args);
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['gif', 'jpeg', 'jpg', 'png', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const [sourcePath] = result.filePaths;
    if (!sourcePath) return null;
    const extension = extname(sourcePath).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new Error('Unsupported image extension');
    const stats = await lstat(sourcePath);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Selected image is not a regular file');

    const targetName = `${generatedIdSchema.parse(createId())}${extension}`;
    await copyFileIfAbsentAtomic({
      sourcePath,
      targetPath: join(imagesDirectory, targetName),
    });
    return `images/${targetName}`;
  };

  ipcMain.handle(IPC_CHANNELS.mediaImportSquare, (_event, ...args) => importImage(args));
  ipcMain.handle(IPC_CHANNELS.mediaImportWelcome, (_event, ...args) => importImage(args));
}
