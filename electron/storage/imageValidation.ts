import { lstat, open } from 'node:fs/promises';
import { extname } from 'node:path';
import { decodeRasterImage, type RasterImageType } from './rasterDecoder';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ImageMetadata {
  type: RasterImageType | 'svg';
  width: number;
  height: number;
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

export async function validateImageContent(
  content: Buffer,
  path: string,
  { allowSvg = false }: { allowSvg?: boolean } = {},
): Promise<ImageMetadata> {
  if (content.length === 0 || content.length > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds the per-image size limit');
  }
  const extension = extname(path).toLowerCase();
  if (extension === '.svg') {
    if (!allowSvg) throw new Error('Unsupported image extension');
    return inspectSvg(content);
  }
  return decodeRasterImage(content, path);
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
