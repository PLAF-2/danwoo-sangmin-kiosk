import { emptyBodySchema, requireAdmin, sessionToken, setSessionCookie } from '../_lib/auth';
import { getDb } from '../_lib/db';
import { endpoint, HttpError, parseBody } from '../_lib/http';

export default endpoint('POST', async (request, response) => {
  parseBody(request, emptyBodySchema);
  const tokenHash = await requireAdmin(request);
  const [session] = await getDb().query(
    `UPDATE admin_sessions SET expires_at = now() + interval '5 minutes', last_used_at = now()
     WHERE token_hash = $1 AND expires_at > now() RETURNING expires_at`, [tokenHash],
  );
  if (!session) throw new HttpError(401, 'Authentication required');
  setSessionCookie(response, sessionToken(request)!);
});
