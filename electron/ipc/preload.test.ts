import { beforeEach, describe, expect, it, vi } from 'vitest';

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}));

describe('preload API', () => {
  beforeEach(() => {
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    vi.resetModules();
  });

  it('exposes exactly one window.kiosk API with the approved methods', async () => {
    await import('../preload');

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(exposeInMainWorld).toHaveBeenCalledWith('kiosk', expect.any(Object));
    const api = exposeInMainWorld.mock.calls[0]?.[1] as Record<string, Record<string, unknown>>;

    expect(Object.keys(api)).toEqual(['catalog', 'settings', 'media', 'orders', 'admin']);
    expect(Object.keys(api.catalog ?? {})).toEqual(['read', 'save']);
    expect(Object.keys(api.settings ?? {})).toEqual([
      'read',
      'save',
      'readPayment',
      'savePayment',
    ]);
    expect(Object.keys(api.media ?? {})).toEqual(['importSquareImage', 'importWelcomeImage']);
    expect(Object.keys(api.orders ?? {})).toEqual(['create', 'read']);
    expect(Object.keys(api.admin ?? {})).toEqual([
      'authenticate',
      'changePassword',
      'exportBackup',
      'importBackup',
    ]);
  });

  it('uses only the fixed channel allowlist', async () => {
    await import('../preload');
    const api = exposeInMainWorld.mock.calls[0]?.[1] as {
      catalog: { read(): Promise<unknown>; save(value: unknown): Promise<unknown> };
      settings: {
        read(): Promise<unknown>;
        save(value: unknown): Promise<unknown>;
        readPayment(): Promise<unknown>;
        savePayment(value: unknown): Promise<unknown>;
      };
      media: { importSquareImage(): Promise<unknown>; importWelcomeImage(): Promise<unknown> };
      orders: { create(value: unknown): Promise<unknown>; read(value: string): Promise<unknown> };
      admin: {
        authenticate(value: string): Promise<unknown>;
        changePassword(current: string, next: string): Promise<unknown>;
        exportBackup(): Promise<unknown>;
        importBackup(): Promise<unknown>;
      };
    };

    await api.catalog.read();
    await api.catalog.save({});
    await api.settings.read();
    await api.settings.save({});
    await api.settings.readPayment();
    await api.settings.savePayment({});
    await api.media.importSquareImage();
    await api.media.importWelcomeImage();
    await api.orders.create({});
    await api.orders.read('order');
    await api.admin.authenticate('password');
    await api.admin.changePassword('current', 'next-password');
    await api.admin.exportBackup();
    await api.admin.importBackup();

    expect(invoke.mock.calls).toEqual([
      ['catalog:read'],
      ['catalog:save', {}],
      ['settings:read'],
      ['settings:save', {}],
      ['settings:read-payment'],
      ['settings:save-payment', {}],
      ['media:import-square-image'],
      ['media:import-welcome-image'],
      ['orders:create', {}],
      ['orders:read', 'order'],
      ['admin:authenticate', 'password'],
      ['admin:change-password', 'current', 'next-password'],
      ['admin:export-backup'],
      ['admin:import-backup'],
    ]);
  });
});
