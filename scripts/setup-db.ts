import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import defaultCatalog from '../data/defaults/catalog.json';
import { replaceCatalog } from '../api/_lib/catalogWrite';
import { getDb } from '../api/_lib/db';
import { seedDatabase } from '../api/_lib/seed';
import { catalogDataSchema } from '../src/domain/schemas';

// Applies api/schema.sql (safe to repeat), installs defaults into an empty database and,
// with --reset-catalog, replaces categories and products with data/defaults/catalog.json.
async function main() {
  const db = getDb();
  const schema = await readFile(resolve(process.cwd(), 'api/schema.sql'), 'utf8');
  for (const statement of schema.split(/;\s*\n/u).map((part) => part.trim()).filter(Boolean)) {
    await db.query(statement);
  }
  await seedDatabase(db);
  if (process.argv.includes('--reset-catalog')) {
    await replaceCatalog(db, catalogDataSchema.parse(defaultCatalog));
    console.log('Replaced the catalog with data/defaults/catalog.json.');
  }
  console.log('Database schema and defaults are ready.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
