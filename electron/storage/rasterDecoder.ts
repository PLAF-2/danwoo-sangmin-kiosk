import { extname } from 'node:path';
import sharp, { type Metadata } from 'sharp';

export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 16_777_216;

export type RasterImageType = 'jpeg' | 'png' | 'webp';

export interface RasterMetadata {
  type: RasterImageType;
  width: number;
  height: number;
}

export async function decodeRasterImage(content: Buffer, path: string): Promise<RasterMetadata> {
  let metadata: Metadata;
  try {
    metadata = await sharp(content, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    throw new Error('Invalid image content', { cause: error });
  }
  if (!metadata.width || !metadata.height || !['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
    throw new Error('Unsupported or invalid raster image');
  }
  if ((metadata.pages ?? 1) !== 1) throw new Error('Animated images are not supported');
  const type = metadata.format as RasterImageType;
  const extension = extname(path).toLowerCase();
  const matches = type === 'jpeg' ? extension === '.jpg' || extension === '.jpeg' : extension === `.${type}`;
  if (!matches) throw new Error('Image extension does not match content');
  if (
    metadata.width > MAX_IMAGE_DIMENSION ||
    metadata.height > MAX_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('Image dimensions exceed safe limits');
  }
  try {
    const decoded = await sharp(content, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true,
    }).raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== metadata.width || decoded.info.height !== metadata.height) {
      throw new Error('Decoded image dimensions changed unexpectedly');
    }
  } catch (error) {
    throw new Error('Image could not be fully decoded', { cause: error });
  }
  return { type, width: metadata.width, height: metadata.height };
}
