import type { UserDataPaths } from '../storage/paths';
import { registerAdminIpc } from './adminIpc';
import { registerBackupIpc, type BackupDialogLike } from './backupIpc';
import { registerCatalogIpc } from './catalogIpc';
import type { IpcMainLike } from './channels';
import { registerMediaIpc, type OpenDialogLike } from './mediaIpc';
import { registerOrderIpc } from './orderIpc';
import { registerSettingsIpc } from './settingsIpc';
import { createIpcSecurity } from './ipcSecurity';

export function registerIpc({
  ipcMain,
  dialog,
  paths,
  trustedRendererUrl,
}: {
  ipcMain: IpcMainLike;
  dialog: OpenDialogLike & BackupDialogLike;
  paths: UserDataPaths;
  trustedRendererUrl: string;
}): void {
  const security = createIpcSecurity({ trustedRendererUrl });
  registerCatalogIpc({ ipcMain, catalogFile: paths.catalogFile, security });
  registerSettingsIpc({
    ipcMain,
    settingsFile: paths.settingsFile,
    paymentFile: paths.paymentFile,
    security,
  });
  registerMediaIpc({ ipcMain, dialog, imagesDirectory: paths.imagesDirectory, security });
  registerOrderIpc({
    ipcMain,
    catalogFile: paths.catalogFile,
    ordersDirectory: paths.ordersDirectory,
    paymentFile: paths.paymentFile,
    security,
  });
  registerAdminIpc({ ipcMain, credentialFile: paths.adminCredentialsFile, security });
  registerBackupIpc({ ipcMain, dialog, paths, security });
}
