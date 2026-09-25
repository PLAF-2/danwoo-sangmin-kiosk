import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerMediaIpc } from './mediaIpc';
import { createTestIpcMain } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('media IPC', () => {
  it('copies an approved image atomically under a generated safe name', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const source = join(directory, 'customer supplied NAME.png');
    await writeFile(source, Buffer.from('image-bytes'));
    const ipcMain = createTestIpcMain();
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'user-data', 'images'),
      dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [source] }) },
      createId: () => 'safe-generated-id',
    });

    await expect(ipcMain.invoke('media:import-square-image')).resolves.toBe(
      'images/safe-generated-id.png',
    );
    await expect(
      readFile(join(directory, 'user-data', 'images', 'safe-generated-id.png'), 'utf8'),
    ).resolves.toBe('image-bytes');
  });

  it('returns null on cancel and rejects unsupported files or extra arguments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-media-'));
    directories.push(directory);
    const ipcMain = createTestIpcMain();
    const showOpenDialog = vi
      .fn()
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [join(directory, 'payload.exe')] });
    registerMediaIpc({
      ipcMain,
      imagesDirectory: join(directory, 'images'),
      dialog: { showOpenDialog },
    });

    await expect(ipcMain.invoke('media:import-welcome-image')).resolves.toBeNull();
    await expect(ipcMain.invoke('media:import-square-image')).rejects.toThrow('Unsupported image');
    await expect(ipcMain.invoke('media:import-square-image', 'unexpected')).rejects.toThrow();
  });
});
