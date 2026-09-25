export interface BrowserWindowLike {
  loadURL(url: string): Promise<unknown> | void;
  loadFile(path: string): Promise<unknown> | void;
  webContents: {
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
    on(event: 'will-navigate', listener: (event: { preventDefault(): void }) => void): void;
  };
}

export interface BrowserWindowConstructor {
  new (options: Record<string, unknown>): BrowserWindowLike;
}

export function createKioskWindow({
  BrowserWindow,
  isPackaged,
  preloadPath,
  developmentUrl,
  rendererHtmlPath,
}: {
  BrowserWindow: BrowserWindowConstructor;
  isPackaged: boolean;
  preloadPath: string;
  developmentUrl?: string;
  rendererHtmlPath: string;
}): BrowserWindowLike {
  const window = new BrowserWindow({
    width: 720,
    height: 1280,
    minWidth: 450,
    minHeight: 800,
    kiosk: isPackaged,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(rendererHtmlPath);
  return window;
}
