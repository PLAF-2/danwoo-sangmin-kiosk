import { z } from 'zod';

import { appSettingsSchema, paymentSettingsSchema } from '../../src/domain';
import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';

export function registerSettingsIpc({
  ipcMain,
  settingsFile,
  paymentFile,
}: {
  ipcMain: IpcMainLike;
  settingsFile: string;
  paymentFile: string;
}): void {
  const settingsStore = createAtomicJsonStore({ filePath: settingsFile, schema: appSettingsSchema });
  const paymentStore = createAtomicJsonStore({ filePath: paymentFile, schema: paymentSettingsSchema });

  ipcMain.handle(IPC_CHANNELS.settingsRead, (_event, ...args) => {
    z.tuple([]).parse(args);
    return settingsStore.read();
  });
  ipcMain.handle(IPC_CHANNELS.settingsSave, async (_event, ...args) => {
    const [input] = z.tuple([appSettingsSchema]).parse(args);
    await settingsStore.write(input);
  });
  ipcMain.handle(IPC_CHANNELS.paymentRead, (_event, ...args) => {
    z.tuple([]).parse(args);
    return paymentStore.read();
  });
  ipcMain.handle(IPC_CHANNELS.paymentSave, async (_event, ...args) => {
    const [input] = z.tuple([paymentSettingsSchema]).parse(args);
    await paymentStore.write(input);
  });
}
