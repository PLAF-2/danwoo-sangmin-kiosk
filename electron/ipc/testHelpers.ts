import { createIpcSecurity } from './ipcSecurity';

export interface TestIpcMain {
  handle(channel: string, listener: (_event: unknown, ...args: unknown[]) => unknown): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  invokeFrom(event: unknown, channel: string, ...args: unknown[]): Promise<unknown>;
}

export interface TestIpcSender {
  id: number;
  mainFrame: TestIpcFrame;
  once(event: 'destroyed', listener: () => void): void;
  destroy(): void;
}

export interface TestIpcFrame {
  url: string;
}

export function createTestIpcEvent({
  id = 1,
  url = 'http://localhost:5173/',
}: { id?: number; url?: string } = {}) {
  const destroyedListeners: Array<() => void> = [];
  const frame: TestIpcFrame = { url };
  const sender: TestIpcSender = {
    id,
    mainFrame: frame,
    once(event, listener) {
      if (event === 'destroyed') destroyedListeners.push(listener);
    },
    destroy() {
      for (const listener of destroyedListeners.splice(0)) listener();
    },
  };
  return { sender, senderFrame: frame };
}

export function createTestIpcSecurity() {
  return createIpcSecurity({
    trustedRendererUrl: 'http://localhost:5173/',
    authenticationBackoffBaseMs: 1,
  });
}

export function createTestIpcMain(): TestIpcMain {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => unknown>();
  const defaultEvent = createTestIpcEvent();
  return {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    async invoke(channel, ...args) {
      return this.invokeFrom(defaultEvent, channel, ...args);
    },
    async invokeFrom(event, channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing test IPC handler: ${channel}`);
      return handler(event, ...args);
    },
  };
}
