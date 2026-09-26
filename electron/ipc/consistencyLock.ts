export interface ConsistencyLock {
  withRead<T>(operation: () => Promise<T>): Promise<T>;
  withWrite<T>(operation: () => Promise<T>): Promise<T>;
}

type Waiter = { kind: 'read' | 'write'; grant(): void };

export function createConsistencyLock(): ConsistencyLock {
  let activeReaders = 0;
  let writerActive = false;
  const waiters: Waiter[] = [];

  const schedule = (): void => {
    if (writerActive || waiters.length === 0) return;
    if (activeReaders > 0 && waiters[0]!.kind === 'write') return;
    if (waiters[0]!.kind === 'write') {
      writerActive = true;
      waiters.shift()!.grant();
      return;
    }
    while (waiters[0]?.kind === 'read') {
      activeReaders += 1;
      waiters.shift()!.grant();
    }
  };

  const acquire = (kind: Waiter['kind']): Promise<void> =>
    new Promise((resolve) => {
      waiters.push({ kind, grant: resolve });
      schedule();
    });

  const run = async <T>(kind: Waiter['kind'], operation: () => Promise<T>): Promise<T> => {
    await acquire(kind);
    try {
      return await operation();
    } finally {
      if (kind === 'read') activeReaders -= 1;
      else writerActive = false;
      schedule();
    }
  };

  return {
    withRead: (operation) => run('read', operation),
    withWrite: (operation) => run('write', operation),
  };
}
