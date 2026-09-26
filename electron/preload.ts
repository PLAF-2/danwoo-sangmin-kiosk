import { contextBridge, ipcRenderer } from 'electron';

import type { KioskApi, SquareCropInput } from '../src/services/kioskApi';
import type {
  AppSettings,
  CatalogData,
  CreateOrderInput,
  PaymentSettings,
} from '../src/domain';
import { IPC_CHANNELS } from './ipc/channels';

const kiosk: KioskApi = Object.freeze({
  catalog: Object.freeze({
    read: () => ipcRenderer.invoke(IPC_CHANNELS.catalogRead),
    save: (input: CatalogData) => ipcRenderer.invoke(IPC_CHANNELS.catalogSave, input),
  }),
  settings: Object.freeze({
    read: () => ipcRenderer.invoke(IPC_CHANNELS.settingsRead),
    save: (input: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.settingsSave, input),
    readPayment: () => ipcRenderer.invoke(IPC_CHANNELS.paymentRead),
    savePayment: (input: PaymentSettings) => ipcRenderer.invoke(IPC_CHANNELS.paymentSave, input),
  }),
  media: Object.freeze({
    selectImage: (kind: 'square' | 'welcome') => ipcRenderer.invoke(IPC_CHANNELS.mediaSelectImage, kind),
    saveSquareCrop: (input: SquareCropInput) => ipcRenderer.invoke(IPC_CHANNELS.mediaSaveSquareCrop, input),
    importSquareImage: () => ipcRenderer.invoke(IPC_CHANNELS.mediaImportSquare),
    importWelcomeImage: () => ipcRenderer.invoke(IPC_CHANNELS.mediaImportWelcome),
  }),
  orders: Object.freeze({
    create: (input: CreateOrderInput) => ipcRenderer.invoke(IPC_CHANNELS.ordersCreate, input),
    read: (orderNumber: string) => ipcRenderer.invoke(IPC_CHANNELS.ordersRead, orderNumber),
  }),
  admin: Object.freeze({
    authenticate: (password: string) => ipcRenderer.invoke(IPC_CHANNELS.adminAuthenticate, password),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.adminLogout),
    changePassword: (currentPassword: string, nextPassword: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.adminChangePassword, currentPassword, nextPassword),
    exportBackup: () => ipcRenderer.invoke(IPC_CHANNELS.backupExport),
    importBackup: () => ipcRenderer.invoke(IPC_CHANNELS.backupImport),
  }),
});

contextBridge.exposeInMainWorld('kiosk', kiosk);
