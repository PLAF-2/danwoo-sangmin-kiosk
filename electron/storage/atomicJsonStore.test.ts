import { link, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAtomicJsonStore } from './atomicJsonStore';

const valueSchema = z.object({ value: z.string() }).strict();
const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'highest-atomic-store-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('createAtomicJsonStore', () => {
  it('replaces JSON through a unique temporary file in the target directory', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'settings.json');
    await writeFile(filePath, JSON.stringify({ value: 'before' }));
    let observedTemporaryPath = '';

    const store = createAtomicJsonStore({
      filePath,
      schema: valueSchema,
      dependencies: {
        rename: async (temporaryPath, targetPath) => {
          observedTemporaryPath = temporaryPath;
          expect(await readFile(temporaryPath, 'utf8')).toContain('after');
          expect(await readFile(targetPath, 'utf8')).toContain('before');
          const { rename } = await import('node:fs/promises');
          await rename(temporaryPath, targetPath);
        },
      },
    });

    await store.write({ value: 'after' });

    expect(observedTemporaryPath).not.toBe(filePath);
    expect(dirname(observedTemporaryPath)).toBe(directory);
    expect(await store.read()).toEqual({ value: 'after' });
    expect(await readdir(directory)).toEqual(['settings.json']);
  });

  it('preserves the existing JSON and removes the temporary file when rename fails', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'catalog.json');
    await writeFile(filePath, JSON.stringify({ value: 'before' }));
    const store = createAtomicJsonStore({
      filePath,
      schema: valueSchema,
      dependencies: {
        rename: async () => {
          throw new Error('injected rename failure');
        },
      },
    });

    await expect(store.write({ value: 'after' })).rejects.toThrow('injected rename failure');

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ value: 'before' });
    expect(await readdir(directory)).toEqual(['catalog.json']);
  });

  it('preserves the existing JSON and removes the temporary file when writing fails', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'payment.json');
    await writeFile(filePath, JSON.stringify({ value: 'before' }));
    const store = createAtomicJsonStore({
      filePath,
      schema: valueSchema,
      dependencies: {
        open: async (path, flags) => {
          const handle = await open(path, flags);
          return {
            writeFile: async () => {
              throw new Error('injected write failure');
            },
            sync: () => handle.sync(),
            close: () => handle.close(),
          };
        },
      },
    });

    await expect(store.write({ value: 'after' })).rejects.toThrow('injected write failure');

    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ value: 'before' });
    expect(await readdir(directory)).toEqual(['payment.json']);
  });

  it('validates parsed JSON with the supplied schema', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'settings.json');
    await writeFile(filePath, JSON.stringify({ value: 42 }));
    const store = createAtomicJsonStore({ filePath, schema: valueSchema });

    await expect(store.read()).rejects.toThrow(z.ZodError);
  });

  it('atomically creates JSON only when the target is absent', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'settings.json');
    await writeFile(filePath, JSON.stringify({ value: 'customized' }));
    const store = createAtomicJsonStore({ filePath, schema: valueSchema });

    await expect(store.writeIfAbsent({ value: 'default' })).resolves.toBe(false);

    expect(await store.read()).toEqual({ value: 'customized' });
    expect(await readdir(directory)).toEqual(['settings.json']);
  });

  it('allows only one concurrent create-if-absent writer to publish', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'catalog.json');
    const first = createAtomicJsonStore({ filePath, schema: valueSchema });
    const second = createAtomicJsonStore({ filePath, schema: valueSchema });

    const results = await Promise.all([
      first.writeIfAbsent({ value: 'first' }),
      second.writeIfAbsent({ value: 'second' }),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(['first', 'second']).toContain((await first.read()).value);
    expect(await readdir(directory)).toEqual(['catalog.json']);
  });

  it('preserves a target created during publication and removes its staged file', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'payment.json');
    const store = createAtomicJsonStore({
      filePath,
      schema: valueSchema,
      dependencies: {
        link: async (temporaryPath, targetPath) => {
          await writeFile(targetPath, JSON.stringify({ value: 'concurrent-custom' }));
          await link(temporaryPath, targetPath);
        },
      },
    });

    await expect(store.writeIfAbsent({ value: 'default' })).resolves.toBe(false);

    expect(await store.read()).toEqual({ value: 'concurrent-custom' });
    expect(await readdir(directory)).toEqual(['payment.json']);
  });

  it('cleans an interrupted create-if-absent publication so a later attempt recovers', async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, 'catalog.json');
    const interrupted = createAtomicJsonStore({
      filePath,
      schema: valueSchema,
      dependencies: {
        link: async () => {
          throw new Error('injected publication failure');
        },
      },
    });

    await expect(interrupted.writeIfAbsent({ value: 'complete' })).rejects.toThrow(
      'injected publication failure',
    );
    expect(await readdir(directory)).toEqual([]);

    const recovered = createAtomicJsonStore({ filePath, schema: valueSchema });
    await expect(recovered.writeIfAbsent({ value: 'complete' })).resolves.toBe(true);
    expect(await recovered.read()).toEqual({ value: 'complete' });
    expect(await readdir(directory)).toEqual(['catalog.json']);
  });
});
