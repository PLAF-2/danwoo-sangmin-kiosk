import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

import { requireAdmin, setSessionCookie, verifyPassword } from '../_lib/auth';
import { getDb } from '../_lib/db';
import { endpoint, HttpError, parseBody } from '../_lib/http';

const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), nextPassword: z.string().min(8).max(128) }).strict();
const derive = promisify(scrypt);

export default endpoint('POST', async (request, response) => {
  await requireAdmin(request);
  const { currentPassword, nextPassword } = parseBody(request, passwordSchema);
  const current = await verifyPassword(currentPassword);
  const salt = randomBytes(16);
  const hash = await derive(nextPassword, salt, 64) as Buffer;
  const db = getDb();
  const [changed] = await db.transaction([
    db.query(`WITH changed AS (
      UPDATE admin_credentials SET algorithm = 'scrypt', salt = $1, hash = $2 WHERE id = 1 AND hash = $3 RETURNING id
    ), revoked AS (
      DELETE FROM admin_sessions WHERE credential_id IN (SELECT id FROM changed)
    ) SELECT id FROM changed`, [salt.toString('hex'), hash.toString('hex'), current.hash]),
  ]);
  if (!changed?.length) throw new HttpError(409, 'Password changed; sign in again');
  setSessionCookie(response, '', 0);
});
