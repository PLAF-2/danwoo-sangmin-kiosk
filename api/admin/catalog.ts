import { catalogDataSchema } from '../../src/domain/schemas';
import { requireAdmin } from '../_lib/auth';
import { replaceCatalog } from '../_lib/catalogWrite';
import { getDb } from '../_lib/db';
import { endpoint, parseBody } from '../_lib/http';

export default endpoint('POST', async (request) => {
  await requireAdmin(request);
  await replaceCatalog(getDb(), parseBody(request, catalogDataSchema));
});
