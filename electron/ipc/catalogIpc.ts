import { z } from 'zod';

import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { createConsistencyLock, type ConsistencyLock } from './consistencyLock';
import { catalogDataSchema } from './schemas';
import type { IpcSecurity } from './ipcSecurity';

export function registerCatalogIpc({
  ipcMain,
  catalogFile,
  security,
  consistencyLock = createConsistencyLock(),
}: {
  ipcMain: IpcMainLike;
  catalogFile: string;
  security: IpcSecurity;
  consistencyLock?: ConsistencyLock;
}): void {
  const store = createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema });

  ipcMain.handle(IPC_CHANNELS.catalogRead, (event, ...args) => {
    security.authorizePublic(event);
    z.tuple([]).parse(args);
    return consistencyLock.withRead(() => store.read());
  });
  ipcMain.handle(IPC_CHANNELS.catalogSave, async (event, ...args) => {
    security.authorizeAdmin(event);
    const [input] = z.tuple([catalogDataSchema]).parse(args);
    await consistencyLock.withWrite(() => store.write(input));
  });
}
