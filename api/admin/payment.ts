import { paymentSettingsSchema } from '../../src/domain/contracts';
import { requireAdmin } from '../_lib/auth';
import { getDb } from '../_lib/db';
import { endpoint, parseBody } from '../_lib/http';

export default endpoint('POST', async (request) => {
  await requireAdmin(request);
  const settings = parseBody(request, paymentSettingsSchema);
  await getDb().query('INSERT INTO payment_settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [JSON.stringify(settings)]);
});
