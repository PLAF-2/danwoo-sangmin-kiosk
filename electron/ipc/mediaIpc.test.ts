import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
