// @vitest-environment node
import { scryptSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import catalog from '../../data/defaults/catalog.json';
import payment from '../../data/defaults/payment.json';
import settings from '../../data/defaults/settings.json';
import type { Database } from './db';
import { seedDatabase } from './seed';

function database(hasData = false, hasCredential = false) {
  const inserts: Array<{ text: string; values: unknown[] }> = [];
  const query = vi.fn((text: string, values: unknown[] = []) => {
    if (text.trimStart().startsWith('SELECT')) {
      return Promise.resolve([{ has_data: hasData, has_credential: hasCredential }]);
    }
    inserts.push({ text, values });
    return Promise.resolve([]);
  });
  const transaction = vi.fn(async (queries: Promise<unknown>[]) => {
    const results = await Promise.all(queries);
    hasData ||= inserts.some(({ text }) => text.includes('INSERT INTO categories'));
    hasCredential ||= inserts.some(({ text }) => text.includes('INSERT INTO admin_credentials'));
    return results;
  });
  return { client: { query, transaction } as unknown as Database, inserts, transaction };
}

describe('seedDatabase', () => {
  it('inserts default data and a verifiable scrypt admin0000 credential into an empty database', async () => {
    const db = database();
    await seedDatabase(db.client);

    const rows = (table: string) => db.inserts.filter(({ text }) => text.includes(`INSERT INTO ${table} `));
    expect(rows('categories').map(({ values }) => values[0])).toEqual(catalog.categories.map(({ id }) => id));
    expect(rows('products').map(({ values }) => values[0])).toEqual(catalog.products.map(({ id }) => id));
    expect(rows('product_detail_images')).toHaveLength(catalog.products.flatMap(({ detailImages }) => detailImages).length);
    expect(rows('app_settings')[0]?.values).toEqual([JSON.stringify(settings)]);
    expect(rows('payment_settings')[0]?.values).toEqual([JSON.stringify(payment)]);
    const credentials = rows('admin_credentials');
    expect(credentials).toHaveLength(1);
    const [salt, hash] = credentials[0]!.values as [string, string];
    expect(salt).toMatch(/^[a-f0-9]{32}$/u);
    expect(hash).toBe(scryptSync('admin0000', Buffer.from(salt, 'hex'), 64).toString('hex'));
    expect(JSON.stringify(db.inserts)).not.toContain('admin0000');
    expect(db.inserts.every(({ text }) => text.includes('ON CONFLICT') && text.includes('DO NOTHING'))).toBe(true);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('performs no inserts or transactions on a second run', async () => {
    const db = database();
    await seedDatabase(db.client);
    db.inserts.length = 0;
    db.transaction.mockClear();
    await seedDatabase(db.client);
    expect(db.inserts).toEqual([]);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('preserves existing data while creating a missing credential', async () => {
    const db = database(true, false);
    await seedDatabase(db.client);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]?.text).toContain('INSERT INTO admin_credentials');
  });

  it('does not replace an existing credential while seeding empty business tables', async () => {
    const db = database(false, true);
    await seedDatabase(db.client);
    expect(db.inserts.length).toBeGreaterThan(0);
    expect(db.inserts.some(({ text }) => text.includes('admin_credentials'))).toBe(false);
  });

  it('does not restore defaults when another business record already exists', async () => {
    const db = database(true, true);
    await seedDatabase(db.client);
    expect(db.inserts).toEqual([]);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
