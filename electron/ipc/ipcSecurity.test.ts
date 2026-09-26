import { describe, expect, it } from 'vitest';

import { createIpcSecurity } from './ipcSecurity';
import { createTestIpcEvent } from './testHelpers';

describe('IPC security', () => {
  it('rejects untrusted origins, child frames, and missing sender metadata', () => {
    const security = createIpcSecurity({ trustedRendererUrl: 'http://localhost:5173/' });
    const trusted = createTestIpcEvent();
    const evil = createTestIpcEvent({ url: 'https://evil.example/' });

    expect(() => security.authorizePublic(trusted)).not.toThrow();
    expect(() => security.authorizePublic(evil)).toThrow('Untrusted IPC sender');
    expect(() =>
      security.authorizePublic({ ...trusted, senderFrame: { url: trusted.senderFrame.url } }),
    ).toThrow('Untrusted IPC sender');
    expect(() => security.authorizePublic({})).toThrow('Untrusted IPC sender');
  });

  it('trusts hash and search navigation within the packaged renderer file only', () => {
    const security = createIpcSecurity({
      trustedRendererUrl: 'file:///C:/app/renderer/index.html',
    });

    expect(() =>
      security.authorizePublic(
        createTestIpcEvent({ url: 'file:///C:/app/renderer/index.html?mode=kiosk#/shop' }),
      ),
    ).not.toThrow();
    expect(() =>
      security.authorizePublic(
        createTestIpcEvent({ url: 'file:///C:/app/renderer/other.html#/shop' }),
      ),
    ).toThrow('Untrusted IPC sender');
    expect(() =>
      security.authorizePublic(createTestIpcEvent({ url: 'https://app.invalid/index.html' })),
    ).toThrow('Untrusted IPC sender');
  });

  it('binds sessions to senders, expires after five idle minutes, and refreshes on use', () => {
    let now = 0;
    const security = createIpcSecurity({
      trustedRendererUrl: 'http://localhost:5173/',
      now: () => now,
    });
    const first = createTestIpcEvent({ id: 1 });
    const second = createTestIpcEvent({ id: 2 });

    security.createAdminSession(first);
    expect(() => security.authorizeAdmin(second)).toThrow('Admin authentication required');
    now = 299_999;
    expect(() => security.authorizeAdmin(first)).not.toThrow();
    now = 599_998;
    expect(() => security.authorizeAdmin(first)).not.toThrow();
    now = 899_999;
    expect(() => security.authorizeAdmin(first)).toThrow('Admin session expired');
  });

  it('invalidates a session when its sender is destroyed and can invalidate all sessions', () => {
    const security = createIpcSecurity({ trustedRendererUrl: 'http://localhost:5173/' });
    const first = createTestIpcEvent({ id: 1 });
    const second = createTestIpcEvent({ id: 2 });
    security.createAdminSession(first);
    security.createAdminSession(second);

    first.sender.destroy();
    expect(() => security.authorizeAdmin(first)).toThrow('Admin authentication required');
    expect(() => security.authorizeAdmin(second)).not.toThrow();
    security.invalidateAllAdminSessions();
    expect(() => security.authorizeAdmin(second)).toThrow('Admin authentication required');
  });

  it('expires a session exactly at the idle timeout boundary', () => {
    let now = 0;
    const security = createIpcSecurity({
      trustedRendererUrl: 'http://localhost:5173/',
      now: () => now,
      adminIdleTimeoutMs: 100,
    });
    const event = createTestIpcEvent();

    security.createAdminSession(event);
    now = 100;

    expect(() => security.authorizeAdmin(event)).toThrow('Admin session expired');
  });

  it('backs off repeated authentication failures per sender and clears on success', () => {
    let now = 0;
    const security = createIpcSecurity({
      trustedRendererUrl: 'http://localhost:5173/',
      now: () => now,
      authenticationBackoffBaseMs: 100,
    });
    const first = createTestIpcEvent({ id: 1 });
    const second = createTestIpcEvent({ id: 2 });

    security.assertAuthenticationAllowed(first);
    expect(() => security.assertAuthenticationAllowed(first)).toThrow('Too many authentication attempts');
    security.recordAuthenticationFailure(first);
    expect(() => security.assertAuthenticationAllowed(first)).toThrow('Too many authentication attempts');
    expect(() => security.assertAuthenticationAllowed(second)).not.toThrow();
    now = 100;
    security.assertAuthenticationAllowed(first);
    security.recordAuthenticationFailure(first);
    now = 299;
    expect(() => security.assertAuthenticationAllowed(first)).toThrow('Too many authentication attempts');
    now = 300;
    security.recordAuthenticationSuccess(first);
    expect(() => security.assertAuthenticationAllowed(first)).not.toThrow();
  });
});
