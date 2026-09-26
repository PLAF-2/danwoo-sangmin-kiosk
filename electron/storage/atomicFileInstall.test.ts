import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { copyFileIfAbsentAtomic } from './atomicFileInstall';

const temporaryDirectories: string[] = [];

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'highest-atomic-file-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('copyFileIfAbsentAtomic', () => {
  it('does not replace an existing destination', async () => {
    const directory = await makeTemporaryDirectory();
    const sourcePath = join(directory, 'source.svg');
    const targetPath = join(directory, 'target.svg');
    await writeFile(sourcePath, '<svg>default</svg>');
    await writeFile(targetPath, '<svg>custom</svg>');

    await expect(copyFileIfAbsentAtomic({ sourcePath, targetPath })).resolves.toBe(false);

    expect(await readFile(targetPath, 'utf8')).toBe('<svg>custom</svg>');
    expect((await readdir(directory)).sort()).toEqual(['source.svg', 'target.svg']);
  });

  it('cleans the staged file after interrupted publication and later recovers', async () => {
    const directory = await makeTemporaryDirectory();
    const sourcePath = join(directory, 'source.svg');
    const targetPath = join(directory, 'target.svg');
    await writeFile(sourcePath, '<svg>complete</svg>');

    await expect(
      copyFileIfAbsentAtomic({
        sourcePath,
        targetPath,
        dependencies: {
          link: async () => {
            throw new Error('injected image publication failure');
          },
        },
      }),
    ).rejects.toThrow('injected image publication failure');
    expect(await readdir(directory)).toEqual(['source.svg']);

    await expect(copyFileIfAbsentAtomic({ sourcePath, targetPath })).resolves.toBe(true);
    expect(await readFile(targetPath, 'utf8')).toBe('<svg>complete</svg>');
    expect((await readdir(directory)).sort()).toEqual(['source.svg', 'target.svg']);
  });

  it('rechecks the destination after staging and immediately before publication', async () => {
    const directory = await makeTemporaryDirectory();
    const sourcePath = join(directory, 'source.svg');
    const targetPath = join(directory, 'target.svg');
    await writeFile(sourcePath, '<svg>complete</svg>');
    let rechecked = false;

    await copyFileIfAbsentAtomic({
      sourcePath,
      targetPath,
      beforePublish: async () => {
        const files = await readdir(directory);
        const stagedFile = files.find((file) => file.endsWith('.tmp'));
        expect(stagedFile).toBeDefined();
        expect(await readFile(join(directory, stagedFile ?? ''), 'utf8')).toBe(
          '<svg>complete</svg>',
        );
        expect(files).not.toContain('target.svg');
        rechecked = true;
      },
    });

    expect(rechecked).toBe(true);
  });
});
