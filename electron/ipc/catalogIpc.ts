import { z } from 'zod';

import { createAtomicJsonStore } from '../storage/atomicJsonStore';
import { IPC_CHANNELS, type IpcMainLike } from './channels';
import { catalogDataSchema } from './schemas';

export function registerCatalogIpc({
  ipcMain,
  catalogFile,
}: {
  ipcMain: IpcMainLike;
  catalogFile: string;
}): void {
  const store = createAtomicJsonStore({ filePath: catalogFile, schema: catalogDataSchema });

  ipcMain.handle(IPC_CHANNELS.catalogRead, (_event, ...args) => {
    z.tuple([]).parse(args);
    return store.read();
  });
  ipcMain.handle(IPC_CHANNELS.catalogSave, async (_event, ...args) => {
    const [input] = z.tuple([catalogDataSchema]).parse(args);
    await store.write(input);
  });
}
