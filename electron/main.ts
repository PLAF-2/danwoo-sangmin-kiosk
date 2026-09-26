import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { startSingleInstanceApplication } from './bootstrap';
import { resolveDefaultsDirectory } from './defaultsDirectory';
import { initializeAdminPassword } from './ipc/adminIpc';
import { createConsistencyLock } from './ipc/consistencyLock';
import { registerIpc } from './ipc/registerIpc';
import {
  createKioskWindow,
  focusExistingKioskWindow,
  type BrowserWindowConstructor,
} from './mainWindow';
import { createMediaRequestHandler, registerMediaSchemePrivileges } from './mediaProtocol';
import { initializeUserData } from './storage/initializeUserData';
import type { UserDataPaths } from './storage/paths';

registerMediaSchemePrivileges(protocol);

function openWindow(): void {
  createKioskWindow({
    BrowserWindow: BrowserWindow as unknown as BrowserWindowConstructor,
    isPackaged: app.isPackaged,
    preloadPath: path.join(__dirname, 'preload.js'),
    ...(MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? { developmentUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL }
      : {}),
    rendererHtmlPath: path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    ),
  });
}

const consistencyLock = createConsistencyLock();
void startSingleInstanceApplication<UserDataPaths>({
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  onSecondInstance: (listener) => app.on('second-instance', () => listener()),
  focusExistingWindow: () => focusExistingKioskWindow(BrowserWindow.getAllWindows()),
  initialize: async () => {
    await app.whenReady();
    const initialized = await initializeUserData({
      app,
      defaultsDirectory: resolveDefaultsDirectory({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        developmentRoot: process.cwd(),
      }),
      consistencyLock,
    });
    await initializeAdminPassword({
      credentialFile: initialized.adminCredentialsFile,
      initialPassword: process.env.KIOSK_ADMIN_INITIAL_PASSWORD,
      log: console,
    });
    return initialized;
  },
  register: (initialized) => {
    protocol.handle('kiosk-media', createMediaRequestHandler(initialized, consistencyLock));
    registerIpc({
      ipcMain,
      dialog,
      paths: initialized,
      trustedRendererUrl:
        MAIN_WINDOW_VITE_DEV_SERVER_URL ??
        pathToFileURL(
          path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        ).href,
      consistencyLock,
    });
  },
  createWindow: openWindow,
  quit: () => app.quit(),
  log: console,
}).then((paths) => {
  if (!paths) return;
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
