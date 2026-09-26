import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import { registerMediaIpc } from './mediaIpc';
import { createTestIpcEvent, createTestIpcMain, createTestIpcSecurity } from './testHelpers';

const directories: string[] = [];

function png(width: number, height: number): Buffer {
  const fixtures = new Map([
    ['1x1', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgZGL+DwABFAEG9O6t0QAAAABJRU5ErkJggg=='],
    ['2x1', 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWNgZGL+D8IABjsCC2IwlrMAAAAASUVORK5CYII='],
  ]);
  return Buffer.from(fixtures.get(`${width}x${height}`)!, 'base64');
}

function webp(): Buffer {
  return Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAEAAUAmJaQAA3AA/v0gUAA=', 'base64');
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('media IPC', () => {
  it('returns a bounded preview instead of the full selected image', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'large.png');
    await sharp(randomBytes(512 * 512 * 3), { raw: { width: 512, height: 512, channels: 3 } })
      .png()
      .toFile(source);
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      security,
    });

    const selection = await ipcMain.invokeFrom(event, 'media:select-image', 'square') as {
      previewDataUrl: string;
      width: number;
      height: number;
    };

    expect(selection).toMatchObject({ width: 512, height: 512 });
    expect(selection.previewDataUrl).toMatch(/^data:image\/png;base64,/u);
    expect(selection.previewDataUrl.length).toBeLessThanOrEqual(512 * 1024);
  });

  it('rejects an oversized encoded crop without installing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'compressed-source.jpg');
    await sharp(randomBytes(2048 * 2048 * 3), { raw: { width: 2048, height: 2048, channels: 3 } })
      .jpeg({ quality: 85 })
      .toFile(source);
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      createId: () => 'oversized-crop',
      security,
    });

    const selection = await ipcMain.invokeFrom(event, 'media:select-image', 'square') as { selectionId: string };
    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: selection.selectionId,
      x: 0,
      y: 0,
      width: 2048,
      height: 2048,
    })).rejects.toThrow('size limit');
    await expect(readFile(join(directory, 'images', 'oversized-crop.png'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('selects a non-square image without exposing its path and saves the requested square crop', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'private-source-name.png');
    await writeFile(source, png(2, 1));
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      createId: () => 'crop-id',
      security,
    });

    const selection = await ipcMain.invokeFrom(event, 'media:select-image', 'square') as {
      selectionId: string;
      previewDataUrl: string;
      width: number;
      height: number;
    };
    expect(selection).toMatchObject({ width: 2, height: 1 });
    expect(selection.previewDataUrl).toMatch(/^data:image\/png;base64,/u);
    expect(JSON.stringify(selection)).not.toContain(source);

    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: selection.selectionId,
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    })).resolves.toBe('images/crop-id.png');
    await expect(sharp(join(directory, 'images', 'crop-id.png')).metadata()).resolves.toMatchObject({
      width: 1,
      height: 1,
    });
    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: selection.selectionId,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })).rejects.toThrow('selection');
  });

  it('binds crop selections to the authenticated sender and validates crop bounds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'source.png');
    await writeFile(source, png(2, 1));
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const first = createTestIpcEvent({ id: 1 });
    const second = createTestIpcEvent({ id: 2 });
    security.createAdminSession(first);
    security.createAdminSession(second);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      security,
    });

    const selection = await ipcMain.invokeFrom(first, 'media:select-image', 'square') as { selectionId: string };
    const crop = { selectionId: selection.selectionId, x: 0, y: 0, width: 1, height: 1 };
    await expect(ipcMain.invokeFrom(second, 'media:save-square-crop', crop)).rejects.toThrow('selection');
    await expect(ipcMain.invokeFrom(first, 'media:save-square-crop', { ...crop, x: 2 })).rejects.toThrow('bounds');
  });

  it('rejects expired selections and selections from a replaced admin session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'source.png');
    await writeFile(source, png(2, 1));
    let now = 0;
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      security,
      now: () => now,
    });

    const expired = await ipcMain.invokeFrom(event, 'media:select-image', 'square') as { selectionId: string };
    now = 5 * 60 * 1000;
    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: expired.selectionId,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })).rejects.toThrow('selection');

    const replaced = await ipcMain.invokeFrom(event, 'media:select-image', 'square') as { selectionId: string };
    security.createAdminSession(event);
    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: replaced.selectionId,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })).rejects.toThrow('selection');
  });

  it('evicts the oldest selection when the eight-slot memory bound is reached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'source.png');
    await writeFile(source, png(2, 1));
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      security,
    });

    const selections: Array<{ selectionId: string }> = [];
    for (let index = 0; index < 9; index += 1) {
      selections.push(await ipcMain.invokeFrom(event, 'media:select-image', 'square') as { selectionId: string });
    }
    await expect(ipcMain.invokeFrom(event, 'media:save-square-crop', {
      selectionId: selections[0]!.selectionId,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })).rejects.toThrow('selection');
  });

  it('copies an approved image atomically under a generated safe name', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'customer supplied NAME.png');
    await writeFile(source, png(1, 1));
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'user-data', 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      createId: () => 'safe-generated-id',
      security,
    });

    await expect(ipcMain.invokeFrom(event, 'media:import-square-image')).resolves.toBe(
      'images/safe-generated-id.png',
    );
    await expect(
      readFile(join(directory, 'user-data', 'images', 'safe-generated-id.png')),
    ).resolves.toEqual(png(1, 1));
  });

  it('returns null on cancel and rejects unsupported files or extra arguments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    const showOpenDialog = vi
      .fn()
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [join(directory, 'payload.exe')] });
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog },
      security,
    });

    await expect(ipcMain.invokeFrom(event, 'media:import-welcome-image')).resolves.toBeNull();
    await expect(ipcMain.invokeFrom(event, 'media:import-square-image')).rejects.toThrow('Unsupported image');
    await expect(ipcMain.invokeFrom(event, 'media:import-square-image', 'unexpected')).rejects.toThrow();
  });

  it('rejects unauthorized, oversized, renamed-invalid, and non-square media', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const oversized = join(directory, 'oversized.png');
    const invalid = join(directory, 'invalid.png');
    const rectangle = join(directory, 'rectangle.png');
    await writeFile(oversized, Buffer.alloc(257));
    await writeFile(invalid, Buffer.from('not an image'));
    await writeFile(rectangle, png(2, 1));
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    const showOpenDialog = vi
      .fn()
      .mockResolvedValueOnce({ canceled: false, filePaths: [oversized] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [invalid] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [rectangle] });
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog },
      security,
      maxBytes: 256,
    });

    await expect(ipcMain.invoke('media:import-square-image')).rejects.toThrow('Admin authentication required');
    security.createAdminSession(event);
    await expect(ipcMain.invokeFrom(event, 'media:import-square-image')).rejects.toThrow('too large');
    await expect(ipcMain.invokeFrom(event, 'media:import-square-image')).rejects.toThrow('Invalid image');
    await expect(ipcMain.invokeFrom(event, 'media:import-square-image')).rejects.toThrow('exactly square');
  });

  it('accepts a positive-dimension welcome image but rejects SVG imports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const welcome = join(directory, 'welcome.png');
    const svg = join(directory, 'customer.svg');
    await writeFile(welcome, png(2, 1));
    await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: {
        showOpenDialog: vi
          .fn()
          .mockResolvedValueOnce({ canceled: false, filePaths: [welcome] })
          .mockResolvedValueOnce({ canceled: false, filePaths: [svg] }),
      },
      security,
      createId: () => 'welcome-id',
    });

    await expect(ipcMain.invokeFrom(event, 'media:import-welcome-image')).resolves.toBe(
      'images/welcome-id.png',
    );
    await expect(ipcMain.invokeFrom(event, 'media:import-welcome-image')).rejects.toThrow(
      'Unsupported image extension',
    );
  });

  it('accepts a fully decodable WebP image', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'welcome.webp');
    await writeFile(source, webp());
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    security.createAdminSession(event);
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      security,
      createId: () => 'webp-id',
    });

    await expect(ipcMain.invokeFrom(event, 'media:import-welcome-image')).resolves.toBe(
      'images/webp-id.webp',
    );
  });
});
