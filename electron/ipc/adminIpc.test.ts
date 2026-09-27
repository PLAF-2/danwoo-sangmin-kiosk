import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initializeAdminPassword, registerAdminIpc } from './adminIpc';
import { createTestIpcEvent, createTestIpcMain, createTestIpcSecurity } from './testHelpers';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function credentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'highest-admin-'));
  directories.push(directory);
  return join(directory, 'admin-credentials.json');
}

describe('admin password IPC', () => {
  it('has no fallback password when the initialization environment variable is absent', async () => {
    const path = await credentialPath();
    const error = vi.fn();

    await initializeAdminPassword({ credentialFile: path, initialPassword: undefined, log: { error } });
    const ipcMain = createTestIpcMain();
    registerAdminIpc({ ipcMain, credentialFile: path, security: createTestIpcSecurity() });

    await expect(ipcMain.invoke('admin:authenticate', 'admin')).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('KIOSK_ADMIN_INITIAL_PASSWORD'));
  });

  it('stores only a salted hash, authenticates, and changes the password', async () => {
    const path = await credentialPath();
    await initializeAdminPassword({
      credentialFile: path,
      initialPassword: 'initial-secret',
      log: { error: vi.fn() },
    });

    const serialized = await readFile(path, 'utf8');
    expect(serialized).not.toContain('initial-secret');
    expect(JSON.parse(serialized)).toMatchObject({ algorithm: 'scrypt' });

    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    registerAdminIpc({ ipcMain, credentialFile: path, security });
    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'wrong')).resolves.toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'initial-secret')).resolves.toBe(true);
    await expect(
      ipcMain.invokeFrom(event, 'admin:change-password', 'initial-secret', 'new-secure-password'),
    ).resolves.toBeUndefined();
    await expect(ipcMain.invokeFrom(event, 'admin:change-password', 'new-secure-password', 'another-password')).rejects.toThrow(
      'Admin authentication required',
    );
    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'initial-secret')).resolves.toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'new-secure-password')).resolves.toBe(true);
  });

  it('rejects invalid boundary inputs and an incorrect current password', async () => {
    const path = await credentialPath();
    await initializeAdminPassword({
      credentialFile: path,
      initialPassword: 'initial-secret',
      log: { error: vi.fn() },
    });
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    registerAdminIpc({ ipcMain, credentialFile: path, security });

    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'ok', 'extra')).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await expect(ipcMain.invokeFrom(event, 'admin:authenticate', 'initial-secret')).resolves.toBe(true);
    await expect(ipcMain.invokeFrom(event, 'admin:change-password', 'wrong', 'new-secure-password')).rejects.toThrow(
      'Current password is incorrect',
    );
    await expect(ipcMain.invokeFrom(event, 'admin:change-password', 'initial-secret', 'short')).rejects.toThrow();
  });

  it('logs out only the requesting sender and immediately rejects protected calls', async () => {
    const path = await credentialPath();
    await initializeAdminPassword({
      credentialFile: path,
      initialPassword: 'initial-secret',
      log: { error: vi.fn() },
    });
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const first = createTestIpcEvent({ id: 1 });
    const second = createTestIpcEvent({ id: 2 });
    security.createAdminSession(first);
    security.createAdminSession(second);
    registerAdminIpc({ ipcMain, credentialFile: path, security });

    await expect(ipcMain.invokeFrom(first, 'admin:logout')).resolves.toBeUndefined();
    await expect(
      ipcMain.invokeFrom(first, 'admin:change-password', 'initial-secret', 'another-password'),
    ).rejects.toThrow('Admin authentication required');
    await expect(
      ipcMain.invokeFrom(second, 'admin:change-password', 'initial-secret', 'another-password'),
    ).resolves.toBeUndefined();
  });

  it('keeps alive only an authenticated admin session', async () => {
    const path = await credentialPath();
    const ipcMain = createTestIpcMain();
    const security = createTestIpcSecurity();
    const event = createTestIpcEvent();
    registerAdminIpc({ ipcMain, credentialFile: path, security });

    await expect(ipcMain.invokeFrom(event, 'admin:keep-alive')).rejects.toThrow(
      'Admin authentication required',
    );
    security.createAdminSession(event);
    await expect(ipcMain.invokeFrom(event, 'admin:keep-alive')).resolves.toBeUndefined();
    await expect(ipcMain.invokeFrom(event, 'admin:keep-alive', 'unexpected')).rejects.toThrow();
  });
});
