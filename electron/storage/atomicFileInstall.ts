import { mkdir as nodeMkdir, open as nodeOpen } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  defaultAtomicPublicationDependencies,
  publishStagedFileIfAbsent,
  type AtomicPublicationDependencies,
} from './atomicFileOperations';

interface AtomicInstallFileHandle {
  readFile(): Promise<Buffer>;
  writeFile(data: Uint8Array): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileInstallDependencies extends AtomicPublicationDependencies {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  open(path: string, flags: 'r' | 'wx'): Promise<AtomicInstallFileHandle>;
}

const defaultDependencies: AtomicFileInstallDependencies = {
  ...defaultAtomicPublicationDependencies,
  mkdir: nodeMkdir,
  open: nodeOpen,
};

async function closeBestEffort(handle: AtomicInstallFileHandle | undefined): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // Preserve the staging or publication failure.
  }
}

export async function copyFileIfAbsentAtomic({
  sourcePath,
  targetPath,
  beforePublish,
  dependencies: dependencyOverrides,
}: {
  sourcePath: string;
  targetPath: string;
  beforePublish?: () => Promise<void>;
  dependencies?: Partial<AtomicFileInstallDependencies>;
}): Promise<boolean> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  await dependencies.mkdir(dirname(targetPath), { recursive: true });

  return publishStagedFileIfAbsent({
    targetPath,
    dependencies,
    ...(beforePublish ? { beforePublish } : {}),
    stage: async (temporaryPath) => {
      let sourceHandle: AtomicInstallFileHandle | undefined;
      let temporaryHandle: AtomicInstallFileHandle | undefined;

      try {
        sourceHandle = await dependencies.open(sourcePath, 'r');
        temporaryHandle = await dependencies.open(temporaryPath, 'wx');
        await temporaryHandle.writeFile(await sourceHandle.readFile());
        await temporaryHandle.sync();
        await temporaryHandle.close();
        temporaryHandle = undefined;
        await sourceHandle.close();
        sourceHandle = undefined;
      } finally {
        await closeBestEffort(temporaryHandle);
        await closeBestEffort(sourceHandle);
      }
    },
  });
}

export async function installBufferIfAbsentAtomic({
  content,
  targetPath,
  dependencies: dependencyOverrides,
}: {
  content: Uint8Array;
  targetPath: string;
  dependencies?: Partial<AtomicFileInstallDependencies>;
}): Promise<boolean> {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  await dependencies.mkdir(dirname(targetPath), { recursive: true });
  return publishStagedFileIfAbsent({
    targetPath,
    dependencies,
    stage: async (temporaryPath) => {
      const handle = await dependencies.open(temporaryPath, 'wx');
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await closeBestEffort(handle);
      }
    },
  });
}
