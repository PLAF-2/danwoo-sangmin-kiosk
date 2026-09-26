import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { z } from 'zod';

import { installBufferIfAbsentAtomic } from '../storage/atomicFileInstall';
import {
  MAX_IMAGE_BYTES,
  readBoundedRegularFile,
  validateImageContent,
} from '../storage/imageValidation';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import type { IpcSecurity } from './ipcSecurity';

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
  security,
  createId = randomUUID,
  maxBytes = MAX_IMAGE_BYTES,
}: {
  ipcMain: IpcMainLike;
  imagesDirectory: string;
  dialog: OpenDialogLike;
  security: IpcSecurity;
  createId?: () => string;
  maxBytes?: number;
}): void {
  const importImage = async (event: unknown, args: unknown[], square: boolean): Promise<string | null> => {
    security.authorizeAdmin(event);
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
    const content = await readBoundedRegularFile(sourcePath, maxBytes);
    const metadata = validateImageContent(content, sourcePath);
    if (square && metadata.width !== metadata.height) throw new Error('Image must be exactly square');

    const targetName = `${generatedIdSchema.parse(createId())}${extension}`;
    await installBufferIfAbsentAtomic({ content, targetPath: join(imagesDirectory, targetName) });
    return `images/${targetName}`;
  };

  ipcMain.handle(IPC_CHANNELS.mediaImportSquare, (event, ...args) => importImage(event, args, true));
  ipcMain.handle(IPC_CHANNELS.mediaImportWelcome, (event, ...args) => importImage(event, args, false));
}
