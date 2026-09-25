import { describe, expect, it, vi } from 'vitest';

import { startApplication } from './bootstrap';

describe('main-process bootstrap', () => {
  it('initializes user data before registering IPC and opening the window', async () => {
    const events: string[] = [];
    const paths = { userData: 'test-user-data' };

    await startApplication({
      initialize: vi.fn(async () => {
        events.push('initialize');
        return paths;
      }),
      register: vi.fn(() => events.push('register')),
      createWindow: vi.fn(() => events.push('window')),
      quit: vi.fn(),
      log: { error: vi.fn() },
    });

    expect(events).toEqual(['initialize', 'register', 'window']);
  });

  it('logs and quits without registering IPC or opening a window when initialization fails', async () => {
    const error = new Error('invalid defaults');
    const register = vi.fn();
    const createWindow = vi.fn();
    const quit = vi.fn();
    const log = { error: vi.fn() };

    await startApplication({
      initialize: vi.fn().mockRejectedValue(error),
      register,
      createWindow,
      quit,
      log,
    });

    expect(register).not.toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('Failed to initialize kiosk user data.', error);
    expect(quit).toHaveBeenCalledOnce();
  });
});
