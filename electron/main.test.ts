import { describe, expect, it, vi } from 'vitest';

import { createKioskWindow } from './mainWindow';

describe('kiosk BrowserWindow', () => {
  it.each([
    [false, false],
    [true, true],
  ])('uses secure portrait options and kiosk=%s only when packaged=%s', (packaged, kiosk) => {
    const loadURL = vi.fn();
    const loadFile = vi.fn();
    const setWindowOpenHandler = vi.fn();
    const on = vi.fn();
    const BrowserWindow = vi.fn(() => ({
      loadURL,
      loadFile,
      webContents: { setWindowOpenHandler, on },
    }));

    createKioskWindow({
      BrowserWindow,
      isPackaged: packaged,
      preloadPath: 'C:/app/preload.js',
      developmentUrl: 'http://localhost:5173',
      rendererHtmlPath: 'C:/app/renderer/index.html',
    });

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 720,
        height: 1280,
        minWidth: 450,
        minHeight: 800,
        kiosk,
        webPreferences: {
          preload: 'C:/app/preload.js',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      }),
    );
    expect(setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(setWindowOpenHandler.mock.calls[0]?.[0]()).toEqual({ action: 'deny' });
    expect(on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(loadFile).not.toHaveBeenCalled();
  });

  it('loads packaged renderer HTML when no development URL is available', () => {
    const loadFile = vi.fn();
    const BrowserWindow = vi.fn(() => ({
      loadURL: vi.fn(),
      loadFile,
      webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
    }));

    createKioskWindow({
      BrowserWindow,
      isPackaged: true,
      preloadPath: 'preload.js',
      rendererHtmlPath: 'renderer/index.html',
    });

    expect(loadFile).toHaveBeenCalledWith('renderer/index.html');
  });
});
