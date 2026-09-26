import { z } from 'zod';

import { appSettingsSchema, paymentSettingsSchema } from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import type { IpcSecurity } from './ipcSecurity';

export function registerSettingsIpc({
  ipcMain,
  settingsFile,
  paymentFile,
  security,
}: {
  ipcMain: IpcMainLike;
  settingsFile: string;
  paymentFile: string;
  security: IpcSecurity;
}): void {
  const settingsStore = createAtomicJsonStore({ filePath: settingsFile, schema: appSettingsSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema });

  ipcMain.handle(IPC_CHANNELS.settingsRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return settingsStore.read();
  });
  ipcMain.handle(IPC_CHANNELS.settingsSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([appSettingsSchema]).parse(args);
    await settingsStore.write(input);
  });
  ipcMain.handle(IPC_CHANNELS.paymentRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return paymentStore.read();
  });
  ipcMain.handle(IPC_CHANNELS.paymentSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([paymentSettingsSchema]).parse(args);
    await paymentStore.write(input);
  });
}
