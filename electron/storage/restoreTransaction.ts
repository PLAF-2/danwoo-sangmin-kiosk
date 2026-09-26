import {
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  rename as nodeRename,
  rm as nodeRm,
} from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';

import { createAtomicJsonStore } from './atomicJsonStore';
import type { UserDataPaths } from './paths';

const transactionPrefix = '.highest-restore-';
const manifestName = 'restore-manifest.json';
const targetKeys = ['catalog', 'settings', 'payment', 'images'] as const;
type TargetKey = (typeof targetKeys)[number];

const manifestSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(['prepared', 'committed']),
    userData: z.string().min(1),
    originals: z.object({
      catalog: z.boolean(),
      settings: z.boolean(),
      payment: z.boolean(),
      images: z.boolean(),
    }).strict(),
  })
  .strict();
type RestoreManifest = z.infer<typeof manifestSchema>;

export interface RestoreFileOperations {
  lstat(path: string): Promise<Pick<Stats, 'isFile' | 'isDirectory' | 'isSymbolicLink'>>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Dirent<string>[]>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
}

const defaultFileOperations: RestoreFileOperations = {
  lstat: nodeLstat,
  mkdir: nodeMkdir,
  readFile: nodeReadFile,
  readdir: nodeReaddir,
  rename: nodeRename,
  rm: nodeRm,
};

function targets(paths: UserDataPaths, transactionRoot: string) {
  const stage = join(transactionRoot, 'stage');
  const rollback = join(transactionRoot, 'rollback');
  return {
    catalog: { live: paths.catalogFile, staged: join(stage, 'catalog.json'), saved: join(rollback, 'catalog.json'), type: 'file' as const },
    settings: { live: paths.settingsFile, staged: join(stage, 'settings.json'), saved: join(rollback, 'settings.json'), type: 'file' as const },
    payment: { live: paths.paymentFile, staged: join(stage, 'payment.json'), saved: join(rollback, 'payment.json'), type: 'file' as const },
    images: { live: paths.imagesDirectory, staged: join(stage, 'images'), saved: join(rollback, 'images'), type: 'directory' as const },
  };
}

async function statIfExists(path: string, fileOperations: RestoreFileOperations) {
  try {
    return await fileOperations.lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function assertOwnedType(
  path: string,
  type: 'file' | 'directory',
  fileOperations: RestoreFileOperations,
): Promise<boolean> {
  const stats = await statIfExists(path, fileOperations);
  if (!stats) return false;
  if (stats.isSymbolicLink()) throw new Error(`Restore path must not be a link: ${path}`);
  if (type === 'file' ? !stats.isFile() : !stats.isDirectory()) {
    throw new Error(`Unexpected restore path type: ${path}`);
  }
  return true;
}

function manifestPath(transactionRoot: string): string {
  return join(transactionRoot, manifestName);
}

async function writeManifest(transactionRoot: string, manifest: RestoreManifest): Promise<void> {
  await createAtomicJsonStore({ filePath: manifestPath(transactionRoot), schema: manifestSchema }).write(
    manifest,
  );
}

async function cleanupCommittedTransaction(
  transactionRoot: string,
  fileOperations: RestoreFileOperations,
): Promise<void> {
  await fileOperations.rm(join(transactionRoot, 'rollback'), { recursive: true, force: true });
  await fileOperations.rm(join(transactionRoot, 'stage'), { recursive: true, force: true });
  await fileOperations.rm(manifestPath(transactionRoot), { recursive: true, force: true });
  await fileOperations.rm(transactionRoot, { recursive: true, force: true });
}

async function readManifest(
  paths: UserDataPaths,
  transactionRoot: string,
  fileOperations: RestoreFileOperations,
): Promise<RestoreManifest> {
  const manifest = manifestSchema.parse(
    JSON.parse(await fileOperations.readFile(manifestPath(transactionRoot), 'utf8')),
  );
  if (resolve(manifest.userData) !== resolve(paths.userData)) {
    throw new Error('Restore journal belongs to different user data');
  }
  return manifest;
}

export async function prepareRestoreTransaction({
  paths,
  transactionRoot,
  fileOperations: overrides,
}: {
  paths: UserDataPaths;
  transactionRoot: string;
  fileOperations?: Partial<RestoreFileOperations>;
}): Promise<void> {
  const fileOperations = { ...defaultFileOperations, ...overrides };
  const restoreTargets = targets(paths, transactionRoot);
  const originals = {} as Record<TargetKey, boolean>;
  for (const key of targetKeys) {
    const target = restoreTargets[key];
    originals[key] = await assertOwnedType(target.live, target.type, fileOperations);
    if (!(await assertOwnedType(target.staged, target.type, fileOperations))) {
      throw new Error(`Missing staged restore target: ${target.staged}`);
    }
  }
  await writeManifest(transactionRoot, {
    version: 1,
    status: 'prepared',
    userData: resolve(paths.userData),
    originals,
  });
}

export async function rollbackRestoreTransaction({
  paths,
  transactionRoot,
  fileOperations: overrides,
}: {
  paths: UserDataPaths;
  transactionRoot: string;
  fileOperations?: Partial<RestoreFileOperations>;
}): Promise<void> {
  const fileOperations = { ...defaultFileOperations, ...overrides };
  const manifest = await readManifest(paths, transactionRoot, fileOperations);
  const restoreTargets = targets(paths, transactionRoot);
  for (const key of [...targetKeys].reverse()) {
    const target = restoreTargets[key];
    const savedExists = await assertOwnedType(target.saved, target.type, fileOperations);
    const liveExists = await assertOwnedType(target.live, target.type, fileOperations);
    if (manifest.originals[key]) {
      if (savedExists) {
        if (liveExists) await fileOperations.rm(target.live, { recursive: true, force: true });
        await fileOperations.rename(target.saved, target.live);
      } else if (!liveExists) {
        throw new Error(`Cannot recover missing original restore target: ${target.live}`);
      }
    } else if (liveExists) {
      await fileOperations.rm(target.live, { recursive: true, force: true });
    }
  }
}

export async function commitRestoreTransaction({
  paths,
  transactionRoot,
  fileOperations: overrides,
}: {
  paths: UserDataPaths;
  transactionRoot: string;
  fileOperations?: Partial<RestoreFileOperations>;
}): Promise<void> {
  const fileOperations = { ...defaultFileOperations, ...overrides };
  const manifest = await readManifest(paths, transactionRoot, fileOperations);
  const restoreTargets = targets(paths, transactionRoot);
  try {
    for (const key of targetKeys) {
      const target = restoreTargets[key];
      await fileOperations.mkdir(dirname(target.saved), { recursive: true });
      if (manifest.originals[key]) await fileOperations.rename(target.live, target.saved);
      await fileOperations.rename(target.staged, target.live);
    }
  } catch (commitError) {
    try {
      await rollbackRestoreTransaction({ paths, transactionRoot, fileOperations });
    } catch (rollbackError) {
      throw new AggregateError([commitError, rollbackError], 'Restore commit and rollback failed');
    }
    await fileOperations.rm(transactionRoot, { recursive: true, force: true });
    throw commitError;
  }
  await writeManifest(transactionRoot, { ...manifest, status: 'committed' });
  await cleanupCommittedTransaction(transactionRoot, fileOperations);
}

export async function recoverPendingRestores(
  paths: UserDataPaths,
  overrides?: Partial<RestoreFileOperations>,
): Promise<void> {
  const fileOperations = { ...defaultFileOperations, ...overrides };
  const parent = paths.userData;
  let entries: Dirent<string>[];
  try {
    entries = await fileOperations.readdir(parent, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.name.startsWith(transactionPrefix)) continue;
    const transactionRoot = join(parent, entry.name);
    const stats = await fileOperations.lstat(transactionRoot);
    if (!entry.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Invalid restore transaction path: ${transactionRoot}`);
    }
    const journal = await statIfExists(manifestPath(transactionRoot), fileOperations);
    if (!journal) {
      const rollback = await statIfExists(join(transactionRoot, 'rollback'), fileOperations);
      if (rollback) throw new Error(`Unjournaled restore rollback preserved: ${transactionRoot}`);
      await fileOperations.rm(transactionRoot, { recursive: true, force: true });
      continue;
    }
    if (!journal.isFile() || journal.isSymbolicLink()) {
      throw new Error(`Invalid restore journal: ${manifestPath(transactionRoot)}`);
    }
    const manifest = await readManifest(paths, transactionRoot, fileOperations);
    if (manifest.status === 'committed') {
      await cleanupCommittedTransaction(transactionRoot, fileOperations);
    } else {
      await rollbackRestoreTransaction({ paths, transactionRoot, fileOperations });
      await fileOperations.rm(transactionRoot, { recursive: true, force: true });
    }
  }
}
