// @vitest-environment node
import { createHash, scryptSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAdmin } from '../../api/_lib/auth';
import type { ApiRequest, ApiResponse } from '../../api/_lib/http';
import login from '../../api/admin/login';
import logout from '../../api/admin/logout';
import keepAlive from '../../api/admin/keep-alive';
import password from '../../api/admin/password';

const { query, transaction } = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../api/_lib/db', () => ({ getDb: () => ({ query, transaction }) }));

const salt = '0123456789abcdef0123456789abcdef';
const credential = { algorithm: 'scrypt', salt, hash: scryptSync('admin0000', Buffer.from(salt, 'hex'), 64).toString('hex') };
const token = '824b1722-4a18-4d69-9b51-dccac58dc700';
const tokenHash = createHash('sha256').update(token).digest('hex');
const request = (body?: unknown, cookie = ''): ApiRequest => ({ method: 'POST', headers: { cookie }, body });
function response() {
  const headers = new Map<string, string>();
  const res = { statusCode: 200, setHeader: (name: string, value: string) => { headers.set(name, value); }, end: vi.fn() };
  return { res: res as unknown as ApiResponse, headers, end: res.end };
}

beforeEach(() => {
  query.mockReset();
  transaction.mockReset().mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('admin login', () => {
  it('verifies scrypt, persists only a token hash, and sets a five-minute secure cookie', async () => {
    query.mockResolvedValueOnce([credential]).mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ token_hash: tokenHash }]);
    const { res, headers, end } = response();
    await login(request({ password: 'admin0000' }), res);
    expect(res.statusCode).toBe(200);
    const cookie = headers.get('Set-Cookie')!;
    const rawToken = cookie.split(';')[0]!.split('=')[1]!;
    expect(rawToken).toMatch(/^[0-9a-f-]{36}$/u);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=300');
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO admin_sessions'))!;
    expect(insert[0]).toContain('INSERT INTO admin_sessions');
    expect(insert[0]).toContain("now() + interval '5 minutes'");
    expect(insert[1]).toContain(createHash('sha256').update(rawToken).digest('hex'));
    expect(JSON.stringify(insert)).not.toContain(rawToken);
    expect(JSON.stringify(end.mock.calls)).not.toContain(rawToken);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(
      [query.mock.results[1]!.value, query.mock.results[2]!.value],
      { isolationLevel: 'ReadCommitted' },
    );
    expect(query.mock.calls[1]?.[0]).toContain('FOR UPDATE');
    expect(insert[1]).toEqual([expect.any(String), credential.salt, credential.hash]);
  });

  it('cannot create a valid session when rotation commits after reading the old credential', async () => {
    let current = { ...credential };
    const sessions = new Set([tokenHash]);
    let rotationStarted = false;
    const rotated = response();
    query.mockImplementation(async (sql: string, params: string[] = []) => {
      if (sql.includes('SELECT expires_at')) {
        return sessions.has(params[0]!) ? [{ expires_at: '2026-09-28T00:05:00Z' }] : [];
      }
      if (sql.includes('SELECT algorithm')) {
        const snapshot = { ...current };
        if (!rotationStarted) {
          rotationStarted = true;
          await password(request({ currentPassword: 'admin0000', nextPassword: 'new-password' }, `__Host-kiosk-admin=${token}`), rotated.res);
        }
        return [snapshot];
      }
      if (sql.includes('UPDATE admin_credentials')) {
        current = { ...current, salt: params[0]!, hash: params[1]! };
        sessions.clear();
        return [{ id: 1 }];
      }
      if (sql.includes('INSERT INTO admin_sessions')) {
        if (sql.includes('WHERE id = 1 AND salt = $2 AND hash = $3') && (params[1] !== current.salt || params[2] !== current.hash)) return [];
        sessions.add(params[0]!);
        return [{ token_hash: params[0] }];
      }
      return [{ id: 1 }];
    });
    const { res, headers } = response();
    await login(request({ password: 'admin0000' }), res);
    expect(rotated.res.statusCode).toBe(200);
    expect(res.statusCode).toBe(401);
    expect(headers.has('Set-Cookie')).toBe(false);
    expect(sessions.size).toBe(0);
    await expect(requireAdmin(request(undefined, `__Host-kiosk-admin=${token}`))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects wrong passwords without creating a session or cookie', async () => {
    query.mockResolvedValue([credential]);
    const { res, headers } = response();
    await login(request({ password: 'wrong' }), res);
    expect(res.statusCode).toBe(401);
    expect(query).toHaveBeenCalledTimes(1);
    expect(headers.has('Set-Cookie')).toBe(false);
  });

  it.each([{}, { password: '' }, { password: 'x'.repeat(129) }, { password: 42 }, { password: 'admin0000', extra: true }])('rejects invalid input %j before querying', async (body) => {
    const { res } = response();
    await login(request(body), res);
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not disclose database errors', async () => {
    query.mockRejectedValue(new Error('secret connection string'));
    const { res, end } = response();
    await login(request({ password: 'admin0000' }), res);
    expect(res.statusCode).toBe(500);
    expect(end).toHaveBeenCalledWith(JSON.stringify({ error: 'Internal server error' }));
  });

  it('rejects GET without running credential validation', async () => {
    const { res, headers } = response();
    await login({ ...request(), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
    expect(headers.get('Allow')).toBe('POST');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('admin sessions', () => {
  it.each(['', '__Host-kiosk-admin=not-a-uuid', `other=${token}`])('rejects absent or malformed session cookies: %s', async (cookie) => {
    await expect(requireAdmin(request(undefined, cookie))).rejects.toMatchObject({ status: 401 });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([{ rows: [] }, { rows: [{ expires_at: '2026-09-27T23:59:59Z' }] }, { rows: [{ expires_at: '2026-09-28T00:00:00Z' }] }])('rejects unknown or expired sessions', async ({ rows }) => {
    query.mockResolvedValue(rows);
    await expect(requireAdmin(request(undefined, `__Host-kiosk-admin=${token}`))).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a valid cookie and looks up its SHA-256 hash', async () => {
    query.mockResolvedValue([{ expires_at: '2026-09-28T00:05:00Z' }]);
    await expect(requireAdmin(request(undefined, `other=1; __Host-kiosk-admin=${token}`))).resolves.toBe(tokenHash);
    expect(query.mock.calls[0]?.[1]).toEqual([tokenHash]);
  });

  it('refreshes both database expiry and browser cookie on keep-alive', async () => {
    query.mockResolvedValue([{ expires_at: '2026-09-28T00:05:00Z' }]);
    const { res, headers } = response();
    await keepAlive(request(undefined, `__Host-kiosk-admin=${token}`), res);
    expect(res.statusCode).toBe(200);
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE admin_sessions'))!;
    expect(update[0]).toContain('expires_at > now()');
    expect(update[1]).toEqual([tokenHash]);
    expect(headers.get('Set-Cookie')).toContain(`__Host-kiosk-admin=${token}`);
    expect(headers.get('Set-Cookie')).toContain('Max-Age=300');
  });

  it('cannot revive a session that expires before the keep-alive update', async () => {
    query.mockResolvedValueOnce([{ expires_at: '2026-09-28T00:05:00Z' }]).mockResolvedValueOnce([]);
    const { res, headers } = response();
    await keepAlive(request(undefined, `__Host-kiosk-admin=${token}`), res);
    expect(res.statusCode).toBe(401);
    expect(headers.has('Set-Cookie')).toBe(false);
  });

  it('deletes the session and clears the cookie on logout', async () => {
    query.mockResolvedValue([]);
    const { res, headers } = response();
    await logout(request(undefined, `__Host-kiosk-admin=${token}`), res);
    expect(res.statusCode).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM admin_sessions'), [tokenHash]);
    expect(headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(headers.get('Set-Cookie')).toContain('HttpOnly');
  });

  it('allows logout after cookie expiry', async () => {
    const { res, headers } = response();
    await logout(request(), res);
    expect(res.statusCode).toBe(200);
    expect(headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([keepAlive, logout])('rejects unexpected body fields for session actions', async (handler) => {
    const { res } = response();
    await handler(request({ unexpected: true }, `__Host-kiosk-admin=${token}`), res);
    expect(res.statusCode).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
