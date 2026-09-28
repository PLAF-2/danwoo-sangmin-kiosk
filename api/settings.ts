import { appSettingsSchema } from '../src/domain/contracts';
import { getDb } from './_lib/db';
import { endpoint } from './_lib/http';

export default endpoint('GET', async () => {
  const [row] = await getDb().query('SELECT data FROM app_settings WHERE id = 1');
  return appSettingsSchema.parse(row?.data);
});
