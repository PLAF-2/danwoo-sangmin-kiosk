import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type Database = Pick<NeonQueryFunction<false, false>, 'query' | 'transaction'>;

// Set only by the local development server (scripts/local-api.ts) when DATABASE_URL is not configured.
export const localDatabaseKey = Symbol.for('highest-kiosk.local-database');

export function getDb(): Database {
  const localDatabase = (globalThis as { [localDatabaseKey]?: Database })[localDatabaseKey];
  if (localDatabase) return localDatabase;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return neon(connectionString);
}
