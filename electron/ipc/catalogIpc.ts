import { z } from 'zod';

import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { catalogDataSchema } from './schemas';
import type { IpcSecurity } from './ipcSecurity';

export function registerCatalogIpc({
  ipcMain,
  catalogFile,
  security,
}: {
  ipcMain: IpcMainLike;
  catalogFile: string;
  security: IpcSecurity;
}): void {
  const store = createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema });

  ipcMain.handle(IPC_CHANNELS.catalogRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return store.read();
  });
  ipcMain.handle(IPC_CHANNELS.catalogSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([catalogDataSchema]).parse(args);
    await store.write(input);
  });
}
