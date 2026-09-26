import { beforeEach, describe, expect, it } from 'vitest';

import { initialSessionState, useSessionStore } from './sessionStore';

describe('session store', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('tracks catalog restoration and one processing request', () => {
    const store = useSessionStore.getState();
    store.setSelectedCategoryId('albums');
    store.setCatalogScrollPosition(420.5);
    store.startProcessing('request-123');

    expect(useSessionStore.getState()).toMatchObject({
      selectedCategoryId: 'albums',
      catalogScrollPosition: 420.5,
      isProcessing: true,
      processingRequestId: 'request-123',
    });
  });

  it('clamps invalid scroll positions to a safe value', () => {
    useSessionStore.getState().setCatalogScrollPosition(-12);
    expect(useSessionStore.getState().catalogScrollPosition).toBe(0);

    useSessionStore.getState().setCatalogScrollPosition(Number.NaN);
    expect(useSessionStore.getState().catalogScrollPosition).toBe(0);
  });

  it('stops processing and releases its request id', () => {
    useSessionStore.getState().startProcessing('request-123');
    useSessionStore.getState().stopProcessing();

    expect(useSessionStore.getState()).toMatchObject({
      isProcessing: false,
      processingRequestId: null,
    });
  });

  it('resets every session value', () => {
    const store = useSessionStore.getState();
    store.setSelectedCategoryId('albums');
    store.setCatalogScrollPosition(300);
    store.startProcessing('request-123');

    store.reset();

    expect(useSessionStore.getState()).toMatchObject(initialSessionState);
  });
});
