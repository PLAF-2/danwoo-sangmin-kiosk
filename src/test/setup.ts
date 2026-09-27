import '@testing-library/jest-dom/vitest';

const NativeRequest = globalThis.Request;
globalThis.Request = class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (!init?.signal) {
      super(input, init);
      return;
    }
    const compatibleInit = { ...init };
    delete compatibleInit.signal;
    super(input, compatibleInit);
  }
} as typeof Request;
