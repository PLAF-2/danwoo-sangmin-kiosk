import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type Database = Pick<NeonQueryFunction<false, false>, 'query' | 'transaction'>;

export function getDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  return neon(connectionString);
}
