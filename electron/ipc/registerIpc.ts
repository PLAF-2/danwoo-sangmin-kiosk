import type { UserDataPaths } from '../storage/paths';
import { registerAdminIpc } from './adminIpc';
import { registerBackupIpc, type BackupDialogLike } from './backupIpc';
import { registerCatalogIpc } from './catalogIpc';
import type { IpcMainLike } from './channels';
import { registerMediaIpc, type OpenDialogLike } from './mediaIpc';
import { registerOrderIpc } from './orderIpc';
import { registerSettingsIpc } from './settingsIpc';

export function registerIpc({
  ipcMain,
  dialog,
  paths,
}: {
  ipcMain: IpcMainLike;
  dialog: OpenDialogLike & BackupDialogLike;
  paths: UserDataPaths;
}): void {
  registerCatalogIpc({ ipcMain, catalogFile: paths.catalogFile });
  registerSettingsIpc({
    ipcMain,
    settingsFile: paths.settingsFile,
    paymentFile: paths.paymentFile,
  });
  registerMediaIpc({ ipcMain, dialog, imagesDirectory: paths.imagesDirectory });
  registerOrderIpc({
    ipcMain,
    catalogFile: paths.catalogFile,
    ordersDirectory: paths.ordersDirectory,
  });
  registerAdminIpc({ ipcMain, credentialFile: paths.adminCredentialsFile });
  registerBackupIpc({ ipcMain, dialog, paths });
}
