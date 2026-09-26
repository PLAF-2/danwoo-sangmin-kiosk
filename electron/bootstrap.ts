export async function startApplication<T>({
  initialize,
  register,
  createWindow,
  quit,
  log,
}: {
  initialize(): Promise<T>;
  register(value: T): void;
  createWindow(value: T): void;
  quit(): void;
  log: { error(message: string, error: unknown): void };
}): Promise<T | null> {
  try {
    const initialized = await initialize();
    register(initialized);
    createWindow(initialized);
    return initialized;
  } catch (error) {
    log.error('Failed to initialize kiosk user data.', error);
    quit();
    return null;
  }
}

export async function startSingleInstanceApplication<T>({
  requestSingleInstanceLock,
  onSecondInstance,
  focusExistingWindow,
  ...application
}: {
  requestSingleInstanceLock(): boolean;
  onSecondInstance(listener: () => void): void;
  focusExistingWindow(): void;
  initialize(): Promise<T>;
  register(value: T): void;
  createWindow(value: T): void;
  quit(): void;
  log: { error(message: string, error: unknown): void };
}): Promise<T | null> {
  if (!requestSingleInstanceLock()) {
    application.quit();
    return null;
  }
  onSecondInstance(focusExistingWindow);
  return startApplication(application);
}
