export const IPC_CHANNELS = Object.freeze({
  catalogRead: 'catalog:read',
  catalogSave: 'catalog:save',
  settingsRead: 'settings:read',
  settingsSave: 'settings:save',
  paymentRead: 'settings:read-payment',
  paymentSave: 'settings:save-payment',
  mediaSelectImage: 'media:select-image',
  mediaSaveSquareCrop: 'media:save-square-crop',
  mediaImportSquare: 'media:import-square-image',
  mediaImportWelcome: 'media:import-welcome-image',
  ordersCreate: 'orders:create',
  ordersRead: 'orders:read',
  adminAuthenticate: 'admin:authenticate',
  adminLogout: 'admin:logout',
  adminChangePassword: 'admin:change-password',
  backupExport: 'admin:export-backup',
  backupImport: 'admin:import-backup',
} as const);

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}
