import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { z } from 'zod';
import sharp from 'sharp';

import { installBufferIfAbsentAtomic } from '../storage/atomicFileInstall';
import {
  MAX_IMAGE_BYTES,
  readBoundedRegularFile,
  validateImageContent,
} from '../storage/imageValidation';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { createConsistencyLock, type ConsistencyLock } from './consistencyLock';
import type { IpcSecurity } from './ipcSecurity';

const allowedExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const generatedIdSchema = z.string().regex(/^[A-Za-z0-9-]+$/u);
const selectionKindSchema = z.enum(['square', 'welcome']);
const squareCropSchema = z
  .object({
    selectionId: z.uuid(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict()
  .refine(({ width, height }) => width === height, {
    path: ['height'],
    message: 'Crop must be square',
  });

const selectionTtlMs = 5 * 60 * 1000;
const maxSelections = 8;
const maxPreviewDataUrlLength = 512 * 1024;

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
  consistencyLock = createConsistencyLock(),
  createId = randomUUID,
  createSelectionId = randomUUID,
  now = Date.now,
  maxBytes = MAX_IMAGE_BYTES,
}: {
  ipcMain: IpcMainLike;
  imagesDirectory: string;
  dialog: OpenDialogLike;
  security: IpcSecurity;
  consistencyLock?: ConsistencyLock;
  createId?: () => string;
  createSelectionId?: () => string;
  now?: () => number;
  maxBytes?: number;
}): void {
  const selections = new Map<string, {
    content: Buffer;
    width: number;
    height: number;
    senderId: number;
    adminSessionId: string;
    expiresAt: number;
  }>();

  const purgeExpiredSelections = () => {
    const currentTime = now();
    for (const [id, selection] of selections) {
      if (selection.expiresAt <= currentTime) selections.delete(id);
    }
  };

  const reserveSelectionSlot = () => {
    purgeExpiredSelections();
    while (selections.size >= maxSelections) {
      const oldest = selections.keys().next().value as string | undefined;
      if (!oldest) break;
      selections.delete(oldest);
    }
  };

  const chooseImage = async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpeg', 'jpg', 'png', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const [sourcePath] = result.filePaths;
    if (!sourcePath) return null;
    const extension = extname(sourcePath).toLowerCase();
    if (!allowedExtensions.has(extension)) throw new Error('Unsupported image extension');
    const content = await readBoundedRegularFile(sourcePath, maxBytes);
    const metadata = await validateImageContent(content, sourcePath);
    if (metadata.type === 'svg') throw new Error('Unsupported image extension');
    return { content, extension, metadata };
  };

  const importImage = async (event: unknown, args: unknown[], square: boolean): Promise<string | null> => {
    security.authorizeAdmin(event);
    z.tuple([]).parse(args);
    const selected = await chooseImage();
    if (!selected) return null;
    return consistencyLock.withWrite(async () => {
      if (square && selected.metadata.width !== selected.metadata.height) throw new Error('Image must be exactly square');

      const targetName = `${generatedIdSchema.parse(createId())}${selected.extension}`;
      await installBufferIfAbsentAtomic({ content: selected.content, targetPath: join(imagesDirectory, targetName) });
      return `images/${targetName}`;
    });
  };

  ipcMain.handle(IPC_CHANNELS.mediaSelectImage, async (event, ...args) => {
    const authorized = security.authorizeAdmin(event);
    const [kind] = z.tuple([selectionKindSchema]).parse(args);
    const selected = await chooseImage();
    if (!selected) return null;
    const preview = await sharp(selected.content)
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const previewDataUrl = `data:image/png;base64,${preview.toString('base64')}`;
    if (previewDataUrl.length > maxPreviewDataUrlLength) throw new Error('Image preview is too large');
    reserveSelectionSlot();
    const selectionId = z.uuid().parse(createSelectionId());
    selections.set(selectionId, {
      content: selected.content,
      width: selected.metadata.width,
      height: selected.metadata.height,
      senderId: authorized.sender.id,
      adminSessionId: authorized.adminSessionId,
      expiresAt: now() + selectionTtlMs,
    });
    return {
      selectionId,
      kind,
      previewDataUrl,
      width: selected.metadata.width,
      height: selected.metadata.height,
    };
  });

  ipcMain.handle(IPC_CHANNELS.mediaSaveSquareCrop, async (event, ...args) => {
    const authorized = security.authorizeAdmin(event);
    const [crop] = z.tuple([squareCropSchema]).parse(args);
    purgeExpiredSelections();
    const selection = selections.get(crop.selectionId);
    if (
      !selection ||
      selection.senderId !== authorized.sender.id ||
      selection.adminSessionId !== authorized.adminSessionId
    ) {
      throw new Error('Invalid or expired image selection');
    }
    if (crop.x + crop.width > selection.width || crop.y + crop.height > selection.height) {
      throw new Error('Crop is outside source bounds');
    }
    selections.delete(crop.selectionId);
    const content = await sharp(selection.content)
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .png()
      .toBuffer();
    const targetName = `${generatedIdSchema.parse(createId())}.png`;
    const metadata = await validateImageContent(content, targetName);
    if (metadata.width !== crop.width || metadata.height !== crop.height) {
      throw new Error('Generated crop dimensions do not match request');
    }
    await consistencyLock.withWrite(() =>
      installBufferIfAbsentAtomic({ content, targetPath: join(imagesDirectory, targetName) }),
    );
    return `images/${targetName}`;
  });

  ipcMain.handle(IPC_CHANNELS.mediaImportSquare, (event, ...args) => importImage(event, args, true));
  ipcMain.handle(IPC_CHANNELS.mediaImportWelcome, (event, ...args) => importImage(event, args, false));
}
