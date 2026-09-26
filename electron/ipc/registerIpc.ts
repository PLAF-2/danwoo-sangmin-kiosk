import type { UserDataPaths } from '../storage/paths';
import { registerAdminIpc } from './adminIpc';
import { registerBackupIpc, type BackupDialogLike } from './backupIpc';
import { registerCatalogIpc } from './catalogIpc';
import type { IpcMainLike } from './channels';
import { registerMediaIpc, type OpenDialogLike } from './mediaIpc';
import { registerOrderIpc } from './orderIpc';
import { registerSettingsIpc } from './settingsIpc';
import { createIpcSecurity } from './ipcSecurity';
import { createConsistencyLock } from './consistencyLock';
import type { ConsistencyLock } from './consistencyLock';

export function registerIpc({
  ipcMain,
  dialog,
  paths,
  trustedRendererUrl,
  consistencyLock = createConsistencyLock(),
}: {
  ipcMain: IpcMainLike;
  dialog: OpenDialogLike & BackupDialogLike;
  paths: UserDataPaths;
  trustedRendererUrl: string;
  consistencyLock?: ConsistencyLock;
}): void {
  const security = createIpcSecurity({ trustedRendererUrl });
  registerCatalogIpc({ ipcMain, catalogFile: paths.catalogFile, security, consistencyLock });
  registerSettingsIpc({
    ipcMain,
    settingsFile: paths.settingsFile,
    paymentFile: paths.paymentFile,
    security,
    consistencyLock,
  });
  registerMediaIpc({ ipcMain, dialog, imagesDirectory: paths.imagesDirectory, security, consistencyLock });
  registerOrderIpc({
    ipcMain,
    catalogFile: paths.catalogFile,
    ordersDirectory: paths.ordersDirectory,
    paymentFile: paths.paymentFile,
    security,
    consistencyLock,
  });
  registerAdminIpc({ ipcMain, credentialFile: paths.adminCredentialsFile, security });
  registerBackupIpc({ ipcMain, dialog, paths, security, consistencyLock });
}
