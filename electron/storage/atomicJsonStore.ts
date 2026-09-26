import {
  mkdir as nodeMkdir,
  open as nodeOpen,
  readFile as nodeReadFile,
  rename as nodeRename,
  unlink as nodeUnlink,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';

import {
  createUniqueTemporaryPath,
  defaultAtomicPublicationDependencies,
  publishStagedFileIfAbsent,
  type AtomicPublicationDependencies,
} from './atomicFileOperations';

export interface AtomicJsonFileHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicJsonStoreDependencies extends AtomicPublicationDependencies {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: 'wx'): Promise<AtomicJsonFileHandle>;
  rename(from: string, to: string): Promise<void>;
}

const defaultDependencies: AtomicJsonStoreDependencies = {
  ...defaultAtomicPublicationDependencies,
  readFile: nodeReadFile,
  mkdir: nodeMkdir,
  open: nodeOpen,
  rename: nodeRename,
  unlink: nodeUnlink,
};

export interface AtomicJsonStoreOptions<T> {
  filePath: string;
  schema: z.ZodType<T>;
  beforePublish?: () => Promise<void>;
  dependencies?: Partial<AtomicJsonStoreDependencies>;
}

export interface AtomicJsonStore<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
  writeIfAbsent(value: T): Promise<boolean>;
}

export function createAtomicJsonStore<T>({
  filePath,
  schema,
  beforePublish,
  dependencies: dependencyOverrides,
}: AtomicJsonStoreOptions<T>): AtomicJsonStore<T> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  async function writeTemporaryJson(temporaryPath: string, value: T): Promise<void> {
    const handle = await dependencies.open(temporaryPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  return {
    async read(): Promise<T> {
      const serialized = await dependencies.readFile(filePath, 'utf8');
      return schema.parse(JSON.parse(serialized));
    },

    async write(value: T): Promise<void> {
      const validatedValue = schema.parse(value);
      const directory = dirname(filePath);
      const temporaryPath = createUniqueTemporaryPath(filePath, dependencies.randomUUID);

      await dependencies.mkdir(directory, { recursive: true });

      try {
        await writeTemporaryJson(temporaryPath, validatedValue);
        await dependencies.rename(temporaryPath, filePath);
        try {
          await dependencies.syncDirectory(directory);
        } catch {
          // Parent-directory durability is best-effort on platforms such as Windows.
        }
      } catch (error) {
        try {
          await dependencies.unlink(temporaryPath);
        } catch {
          // The temporary file may not have been created, or cleanup itself may fail.
        }

        throw error;
      }
    },

    async writeIfAbsent(value: T): Promise<boolean> {
      const validatedValue = schema.parse(value);
      await dependencies.mkdir(dirname(filePath), { recursive: true });

      return publishStagedFileIfAbsent({
        targetPath: filePath,
        dependencies,
        ...(beforePublish ? { beforePublish } : {}),
        stage: (temporaryPath) => writeTemporaryJson(temporaryPath, validatedValue),
      });
    },
  };
}
