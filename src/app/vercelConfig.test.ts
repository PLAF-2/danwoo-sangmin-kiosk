import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import webE2eConfig from '../../playwright.config';

describe('Vercel web deployment', () => {
  it('keeps web checks independent of cloud credentials and local secrets out of git', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    const env = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    const ignore = readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8');
    expect(pkg.scripts.dev).toBe('vite');
    expect(pkg.scripts.build).toBe('vite build');
    expect(pkg.scripts['build:vercel']).toBe('tsx scripts/setup-db.ts --if-database && vite build');
    expect(pkg.scripts['test:e2e']).toBe('playwright test');
    expect(webE2eConfig.testMatch).toBe('web-persistence.spec.ts');
    expect(webE2eConfig.webServer).toBeUndefined();
    expect(env).toMatch(/^DATABASE_URL=$/m);
    expect(env).toMatch(/^BLOB_READ_WRITE_TOKEN=$/m);
    expect(ignore.split(/\r?\n/u)).toEqual(expect.arrayContaining(['.env', '.env.*', '!.env.example', '.vercel/']));
  });

  it('builds the web app and rewrites non-API routes to the SPA', () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));

    expect(config.buildCommand).toBe('npm run build:vercel');
    expect(config.devCommand).toBe('npm run dev');
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
