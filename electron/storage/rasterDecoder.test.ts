import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { decodeRasterImage, MAX_IMAGE_PIXELS } from './rasterDecoder';

describe('raster decoder', () => {
  it('rejects the truncated PNG header that header-only inspection accepted', async () => {
    const truncated = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(truncated);
    truncated.writeUInt32BE(1, 16);
    truncated.writeUInt32BE(1, 20);

    await expect(decodeRasterImage(truncated, 'truncated.png')).rejects.toThrow();
  });

  it('rejects a fully encoded image whose decoded pixel count exceeds the limit', async () => {
    const width = 5000;
    const height = Math.floor(MAX_IMAGE_PIXELS / width) + 1;
    const image = await sharp({
      create: { width, height, channels: 3, background: { r: 1, g: 2, b: 3 } },
    }).png().toBuffer();

    await expect(decodeRasterImage(image, 'pixel-bomb.png')).rejects.toThrow();
  });
});
