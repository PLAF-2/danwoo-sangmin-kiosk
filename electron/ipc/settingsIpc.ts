import { z } from 'zod';

import { appSettingsSchema, paymentSettingsSchema } from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { createConsistencyLock, type ConsistencyLock } from './consistencyLock';
import type { IpcSecurity } from './ipcSecurity';

export function registerSettingsIpc({
  ipcMain,
  settingsFile,
  paymentFile,
  security,
  consistencyLock = createConsistencyLock(),
}: {
  ipcMain: IpcMainLike;
  settingsFile: string;
  paymentFile: string;
  security: IpcSecurity;
  consistencyLock?: ConsistencyLock;
}): void {
  const settingsStore = createAtomicJsonStore({ filePath: settingsFile, schema: appSettingsSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema });

  ipcMain.handle(IPC_CHANNELS.settingsRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return consistencyLock.withRead(() => settingsStore.read());
  });
  ipcMain.handle(IPC_CHANNELS.settingsSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([appSettingsSchema]).parse(args);
    await consistencyLock.withWrite(() => settingsStore.write(input));
  });
  ipcMain.handle(IPC_CHANNELS.paymentRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return consistencyLock.withRead(() => paymentStore.read());
  });
  ipcMain.handle(IPC_CHANNELS.paymentSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([paymentSettingsSchema]).parse(args);
    await consistencyLock.withWrite(() => paymentStore.write(input));
  });
}
