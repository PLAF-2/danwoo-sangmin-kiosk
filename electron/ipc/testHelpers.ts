export interface TestIpcMain {
  handle(channel: string, listener: (_event: unknown, ...args: unknown[]) => unknown): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

export function createTestIpcMain(): TestIpcMain {
  const handlers = new Map<string, (_event: unknown, ...args: unknown[]) => unknown>();
  return {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing test IPC handler: ${channel}`);
      return handler({}, ...args);
    },
  };
}
