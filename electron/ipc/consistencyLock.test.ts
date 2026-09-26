import { describe, expect, it } from 'vitest';

import { createConsistencyLock } from './consistencyLock';

describe('IPC consistency lock', () => {
  it('allows concurrent readers but keeps queued writers exclusive and ordered', async () => {
    const lock = createConsistencyLock();
    const events: string[] = [];
    let releaseReaders!: () => void;
    const readersBlocked = new Promise<void>((resolve) => {
      releaseReaders = resolve;
    });

    const firstRead = lock.withRead(async () => {
      events.push('read-1-start');
      await readersBlocked;
      events.push('read-1-end');
    });
    const secondRead = lock.withRead(async () => {
      events.push('read-2-start');
      await readersBlocked;
      events.push('read-2-end');
    });
    const write = lock.withWrite(async () => {
      events.push('write');
    });
    const trailingRead = lock.withRead(async () => {
      events.push('read-3');
    });

    await Promise.resolve();
    expect(events).toEqual(['read-1-start', 'read-2-start']);
    releaseReaders();
    await Promise.all([firstRead, secondRead, write, trailingRead]);
    expect(events.slice(2)).toEqual(['read-1-end', 'read-2-end', 'write', 'read-3']);
  });
});
