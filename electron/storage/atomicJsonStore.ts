import { randomUUID } from 'node:crypto';
import {
  mkdir as nodeMkdir,
  open as nodeOpen,
  readFile as nodeReadFile,
  rename as nodeRename,
  unlink as nodeUnlink,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { z } from 'zod';

export interface AtomicJsonFileHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicJsonStoreDependencies {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: 'wx'): Promise<AtomicJsonFileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  randomUUID(): string;
}

const defaultDependencies: AtomicJsonStoreDependencies = {
  readFile: nodeReadFile,
  mkdir: nodeMkdir,
  open: nodeOpen,
  rename: nodeRename,
  unlink: nodeUnlink,
  randomUUID,
};

export interface AtomicJsonStoreOptions<T> {
  filePath: string;
  schema: z.ZodType<T>;
  dependencies?: Partial<AtomicJsonStoreDependencies>;
}

export interface AtomicJsonStore<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

export function createAtomicJsonStore<T>({
  filePath,
  schema,
  dependencies: dependencyOverrides,
}: AtomicJsonStoreOptions<T>): AtomicJsonStore<T> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };

  return {
    async read(): Promise<T> {
      const serialized = await dependencies.readFile(filePath, 'utf8');
      return schema.parse(JSON.parse(serialized));
    },

    async write(value: T): Promise<void> {
      const validatedValue = schema.parse(value);
      const directory = dirname(filePath);
      const temporaryPath = join(
        directory,
        `.${basename(filePath)}.${dependencies.randomUUID()}.tmp`,
      );
      let handle: AtomicJsonFileHandle | undefined;

      await dependencies.mkdir(directory, { recursive: true });

      try {
        handle = await dependencies.open(temporaryPath, 'wx');
        await handle.writeFile(`${JSON.stringify(validatedValue, null, 2)}\n`, 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await dependencies.rename(temporaryPath, filePath);
      } catch (error) {
        if (handle) {
          try {
            await handle.close();
          } catch {
            // Preserve the original write failure.
          }
        }

        try {
          await dependencies.unlink(temporaryPath);
        } catch {
          // The temporary file may not have been created, or cleanup itself may fail.
        }

        throw error;
      }
    },
  };
}
