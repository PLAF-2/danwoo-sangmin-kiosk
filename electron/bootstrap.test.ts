import { describe, expect, it, vi } from 'vitest';

import { startApplication, startSingleInstanceApplication } from './bootstrap';

describe('main-process bootstrap', () => {
  it('quits a second instance before storage initialization, IPC, or window creation', async () => {
    const initialize = vi.fn(async () => 'initialized');
    const register = vi.fn();
    const createWindow = vi.fn();
    const quit = vi.fn();

    await startSingleInstanceApplication({
      requestSingleInstanceLock: vi.fn(() => false),
      onSecondInstance: vi.fn(),
      focusExistingWindow: vi.fn(),
      initialize,
      register,
      createWindow,
      quit,
      log: { error: vi.fn() },
    });

    expect(quit).toHaveBeenCalledOnce();
    expect(initialize).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('focuses the existing window when a second instance is requested', async () => {
    let secondInstanceListener: (() => void) | undefined;
    const focusExistingWindow = vi.fn();

    await startSingleInstanceApplication({
      requestSingleInstanceLock: vi.fn(() => true),
      onSecondInstance: vi.fn((listener) => {
        secondInstanceListener = listener;
      }),
      focusExistingWindow,
      initialize: vi.fn(async () => 'initialized'),
      register: vi.fn(),
      createWindow: vi.fn(),
      quit: vi.fn(),
      log: { error: vi.fn() },
    });
    secondInstanceListener?.();

    expect(focusExistingWindow).toHaveBeenCalledOnce();
  });

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
