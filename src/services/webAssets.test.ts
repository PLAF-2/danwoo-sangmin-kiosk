// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { build } from 'vite';
import { expect, it } from 'vitest';

import catalog from '../../data/defaults/catalog.json';
import settings from '../../data/defaults/settings.json';
import { toKioskMediaUrl } from './kioskApi';

it('builds displayable default images at the URLs used by the browser renderer', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'kiosk-web-images-'));
  try {
    await build({ configFile: resolve('vite.web.config.ts'), build: { outDir }, logLevel: 'silent' });
    const references = [settings.welcomeBackgroundImage, ...catalog.products.flatMap((product) => [product.thumbnailImage, ...product.detailImages])];
    for (const reference of references) {
      const url = new URL(toKioskMediaUrl(reference), 'https://kiosk.example/shop');
      expect(url.origin).toBe('https://kiosk.example');
      expect(url.pathname).toBe(`/${reference}`);
      const copiedImage = await readFile(join(outDir, decodeURIComponent(url.pathname)));
      expect(copiedImage).toEqual(await readFile(join('data/defaults', reference)));
      const { info } = await sharp(copiedImage).raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBeGreaterThan(0);
      expect(info.height).toBeGreaterThan(0);
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}, 30_000);
