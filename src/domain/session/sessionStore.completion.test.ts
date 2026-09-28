import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from './sessionStore';

describe('completion session state', () => {
  beforeEach(() => useSessionStore.getState().reset());

  it('accepts a completed order once until the customer session resets', () => {
    expect(useSessionStore.getState().completeOrder('HK-1')).toBe(true);
    expect(useSessionStore.getState().completeOrder('HK-1')).toBe(false);
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().completeOrder('HK-1')).toBe(true);
  });
});
