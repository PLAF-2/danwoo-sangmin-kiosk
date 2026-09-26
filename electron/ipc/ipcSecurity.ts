import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface IpcSenderLike {
  id: number;
  mainFrame: IpcFrameLike;
  once(event: 'destroyed', listener: () => void): void;
}

export interface IpcFrameLike {
  url: string;
}

export interface IpcEventLike {
  sender: IpcSenderLike;
  senderFrame: IpcFrameLike;
}

export interface IpcSecurity {
  authorizePublic(event: unknown): IpcEventLike;
  authorizeAdmin(event: unknown): IpcEventLike;
  createAdminSession(event: unknown): void;
  invalidateAllAdminSessions(): void;
  assertAuthenticationAllowed(event: unknown): void;
  recordAuthenticationFailure(event: unknown): void;
  recordAuthenticationSuccess(event: unknown): void;
}

function parseEvent(event: unknown): IpcEventLike {
  if (typeof event !== 'object' || event === null) throw new Error('Untrusted IPC sender');
  const candidate = event as Partial<IpcEventLike>;
  const sender = candidate.sender;
  const frame = candidate.senderFrame;
  if (
    !sender ||
    !frame ||
    !Number.isSafeInteger(sender.id) ||
    sender.id < 0 ||
    typeof sender.once !== 'function' ||
    typeof frame.url !== 'string' ||
    sender.mainFrame !== frame
  ) {
    throw new Error('Untrusted IPC sender');
  }
  return { sender, senderFrame: frame };
}

function matchesTrustedRenderer(actualUrl: string, trustedRendererUrl: string): boolean {
  try {
    const actual = new URL(actualUrl);
    const trusted = new URL(trustedRendererUrl);
    if (trusted.protocol === 'http:' || trusted.protocol === 'https:') {
      return actual.origin === trusted.origin;
    }
    if (trusted.protocol === 'file:' && actual.protocol === 'file:') {
      const actualPath = resolve(fileURLToPath(actual));
      const trustedPath = resolve(fileURLToPath(trusted));
      return process.platform === 'win32'
        ? actualPath.toLocaleLowerCase('en-US') === trustedPath.toLocaleLowerCase('en-US')
        : actualPath === trustedPath;
    }
    actual.search = '';
    actual.hash = '';
    trusted.search = '';
    trusted.hash = '';
    return actual.href === trusted.href;
  } catch {
    return false;
  }
}

export function createIpcSecurity({
  trustedRendererUrl,
  now = Date.now,
  adminIdleTimeoutMs = 5 * 60 * 1000,
  authenticationBackoffBaseMs = 500,
}: {
  trustedRendererUrl: string;
  now?: () => number;
  adminIdleTimeoutMs?: number;
  authenticationBackoffBaseMs?: number;
}): IpcSecurity {
  const sessions = new Map<number, number>();
  const attempts = new Map<
    number,
    { failures: number; blockedUntil: number; activeUntil: number }
  >();
  const observedSenders = new WeakSet<object>();

  const authorizePublic = (event: unknown): IpcEventLike => {
    const parsed = parseEvent(event);
    if (!matchesTrustedRenderer(parsed.senderFrame.url, trustedRendererUrl)) {
      throw new Error('Untrusted IPC sender');
    }
    if (!observedSenders.has(parsed.sender)) {
      observedSenders.add(parsed.sender);
      parsed.sender.once('destroyed', () => {
        sessions.delete(parsed.sender.id);
        attempts.delete(parsed.sender.id);
      });
    }
    return parsed;
  };

  return {
    authorizePublic,
    authorizeAdmin(event) {
      const parsed = authorizePublic(event);
      const lastUsedAt = sessions.get(parsed.sender.id);
      if (lastUsedAt === undefined) throw new Error('Admin authentication required');
      const currentTime = now();
      if (currentTime - lastUsedAt >= adminIdleTimeoutMs) {
        sessions.delete(parsed.sender.id);
        throw new Error('Admin session expired');
      }
      sessions.set(parsed.sender.id, currentTime);
      return parsed;
    },
    createAdminSession(event) {
      const parsed = authorizePublic(event);
      sessions.set(parsed.sender.id, now());
    },
    invalidateAllAdminSessions() {
      sessions.clear();
    },
    assertAuthenticationAllowed(event) {
      const parsed = authorizePublic(event);
      const attempt = attempts.get(parsed.sender.id);
      const currentTime = now();
      if (attempt && (currentTime < attempt.blockedUntil || currentTime < attempt.activeUntil)) {
        throw new Error('Too many authentication attempts');
      }
      attempts.set(parsed.sender.id, {
        failures: attempt?.failures ?? 0,
        blockedUntil: attempt?.blockedUntil ?? 0,
        activeUntil: currentTime + 60_000,
      });
    },
    recordAuthenticationFailure(event) {
      const parsed = authorizePublic(event);
      const failures = (attempts.get(parsed.sender.id)?.failures ?? 0) + 1;
      const backoff = Math.min(authenticationBackoffBaseMs * 2 ** (failures - 1), 30_000);
      attempts.set(parsed.sender.id, { failures, blockedUntil: now() + backoff, activeUntil: 0 });
    },
    recordAuthenticationSuccess(event) {
      const parsed = authorizePublic(event);
      attempts.delete(parsed.sender.id);
    },
  };
}
