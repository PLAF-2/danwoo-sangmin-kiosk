import { access, readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import type { Plugin, ViteDevServer } from 'vite';

import { localDatabaseKey, type Database } from '../api/_lib/db';

type ApiHandler = (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => Promise<void>;

// Mirrors the Neon driver: queries run lazily, either awaited alone or passed to transaction().
export function createPgliteDatabase(pg: PGlite): Database {
  const query = (sql: string, params: unknown[] = []) => ({
    sql,
    params,
    then<T>(resolve: (rows: unknown[]) => T, reject: (error: unknown) => T) {
      return pg.query(sql, params).then(({ rows }) => rows).then(resolve, reject);
    },
  });
  const transaction = (queries: ReturnType<typeof query>[]) => pg.transaction(async (tx) => {
    const results: unknown[][] = [];
    for (const { sql, params } of queries) results.push((await tx.query(sql, params)).rows);
    return results;
  });
  return { query, transaction } as unknown as Database;
}

async function installInMemoryDatabase(server: ViteDevServer) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(await readFile(resolve(server.config.root, 'api/schema.sql'), 'utf8'));
  const db = createPgliteDatabase(pg);
  (globalThis as { [localDatabaseKey]?: Database })[localDatabaseKey] = db;
  const { seedDatabase } = await server.ssrLoadModule('/api/_lib/seed.ts') as typeof import('../api/_lib/seed');
  await seedDatabase(db);
  server.config.logger.info('  ➜  API:     in-memory database seeded from data/defaults (admin password: admin0000)');
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

// Serves api/*.ts like Vercel functions so `npm run dev` works without a Vercel account or database.
export function localApi(): Plugin {
  return {
    name: 'highest-local-api',
    apply: 'serve',
    async configureServer(server) {
      if (!process.env.DATABASE_URL) await installInMemoryDatabase(server);
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        const name = path.match(/^\/api\/((?:[a-z-]+\/)*[a-z-]+)$/u)?.[1];
        if (!path.startsWith('/api/')) return next();
        const file = name && resolve(server.config.root, 'api', `${name}.ts`);
        if (!file || !(await access(file).then(() => true, () => false))) {
          response.statusCode = 404;
          response.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        try {
          const handler = (await server.ssrLoadModule(`/api/${name}.ts`)).default as ApiHandler;
          const apiRequest = request as IncomingMessage & { body?: unknown };
          if (request.headers['content-type']?.startsWith('application/json')) apiRequest.body = await readJsonBody(request);
          await handler(apiRequest, response);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
