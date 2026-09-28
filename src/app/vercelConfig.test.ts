import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vercel web deployment', () => {
  it('builds the web app and rewrites non-API routes to the SPA', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

    expect(config.buildCommand).toBe('npm run build:web');
    expect(config.outputDirectory).toBe('dist');
    expect(config.rewrites).toContainEqual({
      source: '/((?!api(?:/|$)).*)',
      destination: '/index.html',
    });
    const spaRewrite = new RegExp(`^${config.rewrites[0].source}$`);
    expect(spaRewrite.test('/catalog')).toBe(true);
    expect(spaRewrite.test('/api/orders')).toBe(false);
    expect(spaRewrite.test('/api')).toBe(false);
  });
});
