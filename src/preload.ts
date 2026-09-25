import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('kiosk', Object.freeze({}));
