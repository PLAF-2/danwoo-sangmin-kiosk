import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCatalogData, createAppSettings, createPaymentSettings } from '../../src/test/fixtures';
import { registerCatalogIpc } from './catalogIpc';
import { registerSettingsIpc } from './settingsIpc';
import { createTestIpcMain } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('catalog and settings IPC', () => {
  it('persists valid values and rejects every malformed renderer input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'highest-ipc-'));
    directories.push(directory);
    const ipcMain = createTestIpcMain();
    registerCatalogIpc({ ipcMain, catalogFile: join(directory, 'catalog.json') });
    registerSettingsIpc({
      ipcMain,
      settingsFile: join(directory, 'settings.json'),
      paymentFile: join(directory, 'payment.json'),
    });

    const catalog = createCatalogData();
    const settings = createAppSettings();
    const payment = createPaymentSettings();
    await ipcMain.invoke('catalog:save', catalog);
    await ipcMain.invoke('settings:save', settings);
    await ipcMain.invoke('settings:save-payment', payment);

    await expect(ipcMain.invoke('catalog:read')).resolves.toEqual(catalog);
    await expect(ipcMain.invoke('settings:read')).resolves.toEqual(settings);
    await expect(ipcMain.invoke('settings:read-payment')).resolves.toEqual(payment);
    await expect(ipcMain.invoke('catalog:save', { ...catalog, extra: true })).rejects.toThrow();
    await expect(ipcMain.invoke('settings:save', { ...settings, extra: true })).rejects.toThrow();
    await expect(ipcMain.invoke('settings:read', 'unexpected')).rejects.toThrow();
  });
});
