import { randomUUID } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';

import { installBufferIfAbsentAtomic } from '../storage/atomicFileInstall';
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

type ImageType = 'gif' | 'jpeg' | 'png' | 'webp';
interface ImageMetadata {
  type: ImageType;
  width: number;
  height: number;
}

function parseJpeg(buffer: Buffer): ImageMetadata | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null;
      return { type: 'jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function inspectImage(buffer: Buffer): ImageMetadata {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    buffer.subarray(12, 16).toString('ascii') === 'IHDR'
  ) {
    const metadata = { type: 'png' as const, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (metadata.width > 0 && metadata.height > 0) return metadata;
  }
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    const metadata = { type: 'gif' as const, width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    if (metadata.width > 0 && metadata.height > 0) return metadata;
  }
  const jpeg = parseJpeg(buffer);
  if (jpeg && jpeg.width > 0 && jpeg.height > 0) return jpeg;
  if (
    buffer.length >= 25 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.readUInt32LE(4) + 8 <= buffer.length &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunkType = buffer.subarray(12, 16).toString('ascii');
    const chunkLength = buffer.readUInt32LE(16);
    if (20 + chunkLength <= buffer.length) {
      if (chunkType === 'VP8X' && chunkLength >= 10 && buffer.length >= 30) {
        return {
          type: 'webp',
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
        };
      }
      if (
        chunkType === 'VP8 ' &&
        chunkLength >= 10 &&
        buffer.length >= 30 &&
        buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))
      ) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { type: 'webp', width, height };
      }
      if (chunkType === 'VP8L' && chunkLength >= 5 && buffer[20] === 0x2f) {
        const dimensions = buffer.readUInt32LE(21);
        return {
          type: 'webp',
          width: (dimensions & 0x3fff) + 1,
          height: ((dimensions >>> 14) & 0x3fff) + 1,
        };
      }
    }
  }
  throw new Error('Invalid image content');
}

async function readBoundedRegularFile(sourcePath: string, maxBytes: number): Promise<Buffer> {
  const pathStats = await lstat(sourcePath);
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    throw new Error('Selected image is not a regular file');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid media size limit');
  if (pathStats.size > maxBytes) throw new Error('Selected image is too large');

  const handle = await open(sourcePath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxBytes) throw new Error('Selected image is too large');
    const content = Buffer.alloc(Math.min(maxBytes + 1, stats.size + 1));
    const { bytesRead } = await handle.read(content, 0, content.length, 0);
    if (bytesRead > maxBytes) throw new Error('Selected image is too large');
    return content.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function extensionMatches(type: ImageType, extension: string): boolean {
  return type === 'jpeg' ? extension === '.jpg' || extension === '.jpeg' : extension === `.${type}`;
}

export function registerMediaIpc({
  ipcMain,
  imagesDirectory,
  dialog,
  security,
  createId = randomUUID,
  maxBytes = 10 * 1024 * 1024,
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
    const metadata = inspectImage(content);
    if (!extensionMatches(metadata.type, extension)) throw new Error('Image extension does not match content');
    if (square && metadata.width !== metadata.height) throw new Error('Image must be exactly square');

    const targetName = `${generatedIdSchema.parse(createId())}${extension}`;
    await installBufferIfAbsentAtomic({ content, targetPath: join(imagesDirectory, targetName) });
    return `images/${targetName}`;
  };

  ipcMain.handle(IPC_CHANNELS.mediaImportSquare, (event, ...args) => importImage(event, args, true));
  ipcMain.handle(IPC_CHANNELS.mediaImportWelcome, (event, ...args) => importImage(event, args, false));
}
