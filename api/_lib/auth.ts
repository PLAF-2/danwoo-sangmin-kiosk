import { createHash, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

import { getDb } from './db';
import { HttpError, type ApiRequest, type ApiResponse } from './http';

const derive = promisify(scrypt);
const cookieName = '__Host-kiosk-admin';
const credentialSchema = z.object({
  algorithm: z.literal('scrypt'),
  salt: z.string().regex(/^[0-9a-f]{32}$/u),
  hash: z.string().regex(/^[0-9a-f]{128}$/u),
}).strict();
export const loginSchema = z.object({ password: z.string().min(1).max(128) }).strict();
export const emptyBodySchema = z.object({}).strict().optional();

export function sessionToken(request: ApiRequest): string | undefined {
  const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim());
  const value = cookies?.find((cookie) => cookie.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(response: ApiResponse, token: string, maxAge = 300): void {
  response.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

export async function createSession(password: string): Promise<string> {
  const db = getDb();
  const [row] = await db.query('SELECT algorithm, salt, hash FROM admin_credentials WHERE id = 1');
  if (!row) throw new HttpError(401, 'Invalid password');
  const credential = credentialSchema.parse(row);
  const actual = await derive(password, Buffer.from(credential.salt, 'hex'), 64) as Buffer;
  if (!timingSafeEqual(actual, Buffer.from(credential.hash, 'hex'))) throw new HttpError(401, 'Invalid password');
  const token = randomUUID();
  await db.query(
    `INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, now() + interval '5 minutes')`,
    [hashToken(token)],
  );
  return token;
}

export async function requireAdmin(request: ApiRequest): Promise<string> {
  const token = sessionToken(request);
  if (!token) throw new HttpError(401, 'Authentication required');
  const tokenHash = hashToken(token);
  const [session] = await getDb().query(
    'SELECT expires_at FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()', [tokenHash],
  );
  const expiry = z.coerce.date().safeParse(session?.expires_at);
  if (!expiry.success || expiry.data.getTime() <= Date.now()) throw new HttpError(401, 'Authentication required');
  return tokenHash;
}
