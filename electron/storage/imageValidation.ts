import { lstat, open } from 'node:fs/promises';
import { extname } from 'node:path';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type RasterImageType = 'gif' | 'jpeg' | 'png' | 'webp';

export interface ImageMetadata {
  type: RasterImageType | 'svg';
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
      return {
        type: 'jpeg',
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function inspectRasterImage(buffer: Buffer): ImageMetadata {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    buffer.subarray(12, 16).toString('ascii') === 'IHDR'
  ) {
    const metadata = {
      type: 'png' as const,
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
    if (metadata.width > 0 && metadata.height > 0) return metadata;
  }
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    const metadata = {
      type: 'gif' as const,
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
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

function inspectSvg(buffer: Buffer): ImageMetadata {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error('Invalid SVG encoding');
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b(?:[^>]*\/>|[\s\S]*<\/svg>)\s*$/iu.test(source)) {
    throw new Error('Invalid SVG content');
  }
  if (
    /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon[a-z][\w:-]*\s*=|\b(?:href|xlink:href|src)\s*=\s*(?!["']#)|\burl\s*\(|&(?:#x?[0-9a-f]+|[a-z][\w.-]*);/iu.test(
      source,
    )
  ) {
    throw new Error('Unsafe SVG content');
  }
  const openingTag = source.match(/<svg\b([^>]*)>/iu)?.[1] ?? '';
  const width = Number(openingTag.match(/\bwidth\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']/iu)?.[1]);
  const height = Number(openingTag.match(/\bheight\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']/iu)?.[1]);
  if (width > 0 && height > 0) return { type: 'svg', width, height };
  const viewBox = openingTag
    .match(/\bviewBox\s*=\s*["']([^"']+)["']/u)?.[1]
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) {
    return { type: 'svg', width: viewBox[2]!, height: viewBox[3]! };
  }
  throw new Error('SVG must declare positive dimensions');
}

export function validateImageContent(
  content: Buffer,
  path: string,
  { allowSvg = false }: { allowSvg?: boolean } = {},
): ImageMetadata {
  if (content.length === 0 || content.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the per-image size limit');
  }
  const extension = extname(path).toLowerCase();
  if (extension === '.svg') {
    if (!allowSvg) throw new Error('Unsupported image extension');
    return inspectSvg(content);
  }
  const metadata = inspectRasterImage(content);
  const matches =
    metadata.type === 'jpeg'
      ? extension === '.jpg' || extension === '.jpeg'
      : extension === `.${metadata.type}`;
  if (!matches) throw new Error('Image extension does not match content');
  return metadata;
}

export async function readBoundedRegularFile(
  sourcePath: string,
  maxBytes: number,
  label = 'Selected image',
): Promise<Buffer> {
  const pathStats = await lstat(sourcePath);
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) {
    throw new Error(`${label} is not a regular file`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid file size limit');
  if (pathStats.size > maxBytes) throw new Error(`${label} is too large`);

  const handle = await open(sourcePath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxBytes) throw new Error(`${label} is too large`);
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > maxBytes) throw new Error(`${label} is too large`);
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}
