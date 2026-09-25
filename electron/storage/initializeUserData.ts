import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { z } from 'zod';

import {
  appSettingsSchema,
  categorySchema,
  paymentSettingsSchema,
  productSchema,
} from '../../src/domain';
import { createAtomicJsonStore } from './atomicJsonStore';
import {
  createUserDataPaths,
  resolveImagePath,
  type ElectronPathProvider,
  type UserDataPaths,
} from './paths';

const catalogDataSchema = z
  .object({
    categories: z.array(categorySchema),
    products: z.array(productSchema),
  })
  .strict();

const defaultFiles = [
  { name: 'catalog.json', pathKey: 'catalogFile', schema: catalogDataSchema },
  { name: 'settings.json', pathKey: 'settingsFile', schema: appSettingsSchema },
  { name: 'payment.json', pathKey: 'paymentFile', schema: paymentSettingsSchema },
] as const;

export interface InitializeUserDataOptions {
  app: ElectronPathProvider;
  defaultsDirectory: string;
}

interface ValidatedDefault {
  targetPath: string;
  schema: z.ZodType;
  value: unknown;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function validateDefaults(
  defaultsDirectory: string,
  paths: UserDataPaths,
): Promise<ValidatedDefault[]> {
  return Promise.all(
    defaultFiles.map(async ({ name, pathKey, schema }) => {
      const serialized = await readFile(join(defaultsDirectory, name), 'utf8');

      return {
        targetPath: paths[pathKey],
        schema,
        value: schema.parse(JSON.parse(serialized)),
      };
    }),
  );
}

async function copyMissingImages(
  sourceDirectory: string,
  paths: UserDataPaths,
  rootSourceDirectory = sourceDirectory,
): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDirectory, entry.name);
    const sourceRelativePath = relative(rootSourceDirectory, sourcePath);
    const storedPath = join('images', sourceRelativePath);
    const targetPath = resolveImagePath(paths, storedPath);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await copyMissingImages(sourcePath, paths, rootSourceDirectory);
      continue;
    }

    if (!entry.isFile()) continue;

    await mkdir(dirname(targetPath), { recursive: true });
    try {
      await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

export async function initializeUserData({
  app,
  defaultsDirectory,
}: InitializeUserDataOptions): Promise<UserDataPaths> {
  const paths = createUserDataPaths(app);
  const validatedDefaults = await validateDefaults(defaultsDirectory, paths);

  await mkdir(paths.imagesDirectory, { recursive: true });

  for (const defaultFile of validatedDefaults) {
    if (await pathExists(defaultFile.targetPath)) continue;

    const store = createAtomicJsonStore({
      filePath: defaultFile.targetPath,
      schema: defaultFile.schema,
    });
    await store.write(defaultFile.value);
  }

  await copyMissingImages(join(defaultsDirectory, 'images'), paths);
  return paths;
}
