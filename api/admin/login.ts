import { createSession, loginSchema, setSessionCookie } from '../_lib/auth';
import { endpoint, parseBody } from '../_lib/http';

export default endpoint('POST', async (request, response) => {
  const { password } = parseBody(request, loginSchema);
  setSessionCookie(response, await createSession(password));
});
