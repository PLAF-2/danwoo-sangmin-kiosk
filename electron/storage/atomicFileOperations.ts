import { randomUUID } from 'node:crypto';
import {
  link as nodeLink,
  open as nodeOpen,
  unlink as nodeUnlink,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface AtomicPublicationDependencies {
  link(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  randomUUID(): string;
  syncDirectory(path: string): Promise<void>;
}

export async function syncDirectoryBestEffort(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof nodeOpen>> | undefined;

  try {
    // POSIX directory fsync makes the rename/link durable. Windows commonly rejects
    // opening directories, so this is deliberately best-effort rather than a guarantee.
    handle = await nodeOpen(directory, 'r');
    await handle.sync();
  } catch {
    // File contents are already synced; some platforms do not expose directory fsync.
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // Closing a best-effort directory handle must not invalidate a published file.
      }
    }
  }
}

export const defaultAtomicPublicationDependencies: AtomicPublicationDependencies = {
  link: nodeLink,
  unlink: nodeUnlink,
  randomUUID,
  syncDirectory: syncDirectoryBestEffort,
};

export function createUniqueTemporaryPath(
  targetPath: string,
  createId: () => string = randomUUID,
): string {
  return join(dirname(targetPath), `.${basename(targetPath)}.${createId()}.tmp`);
}

async function removeTemporaryFile(
  temporaryPath: string,
  dependencies: AtomicPublicationDependencies,
): Promise<void> {
  try {
    await dependencies.unlink(temporaryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function publishStagedFileIfAbsent({
  targetPath,
  stage,
  beforePublish,
  dependencies: dependencyOverrides,
}: {
  targetPath: string;
  stage(temporaryPath: string): Promise<void>;
  beforePublish?: () => Promise<void>;
  dependencies?: Partial<AtomicPublicationDependencies>;
}): Promise<boolean> {
  const dependencies = { ...defaultAtomicPublicationDependencies, ...dependencyOverrides };
  const temporaryPath = createUniqueTemporaryPath(targetPath, dependencies.randomUUID);
  let published = false;

  try {
    await stage(temporaryPath);
    await beforePublish?.();
    try {
      await dependencies.link(temporaryPath, targetPath);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  } finally {
    await removeTemporaryFile(temporaryPath, dependencies);
  }

  if (published) {
    try {
      await dependencies.syncDirectory(dirname(targetPath));
    } catch {
      // Directory sync is best-effort; see syncDirectoryBestEffort above.
    }
  }

  return published;
}
