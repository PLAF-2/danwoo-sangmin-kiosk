import { emptyBodySchema, hashToken, sessionToken, setSessionCookie } from '../_lib/auth';
import { getDb } from '../_lib/db';
import { endpoint, parseBody } from '../_lib/http';

export default endpoint('POST', async (request, response) => {
  parseBody(request, emptyBodySchema);
  const token = sessionToken(request);
  if (token) await getDb().query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)]);
  setSessionCookie(response, '', 0);
});
