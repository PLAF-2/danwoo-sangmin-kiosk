import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';

import {
  appSettingsSchema,
  categorySchema,
  paymentSettingsSchema,
  productSchema,
} from '../../src/domain';
import { createAtomicJsonStore } from './atomicJsonStore';
import {
  copyFileIfAbsentAtomic,
  type AtomicFileInstallDependencies,
} from './atomicFileInstall';
import {
  createUserDataPaths,
  resolveImagePath,
  type ElectronPathProvider,
  type UserDataPaths,
} from './paths';
import { recoverPendingRestores } from './restoreTransaction';

const catalogDataSchema = z
  .object({
    categories: z.array(categorySchema),
    products: z.array(productSchema),
  })
  .strict();

const allowedImageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

export interface InitializeUserDataOptions {
  app: ElectronPathProvider;
  defaultsDirectory: string;
  dependencies?: {
    imageInstall?: Partial<AtomicFileInstallDependencies>;
  };
}

type CatalogData = z.infer<typeof catalogDataSchema>;
type AppSettings = z.infer<typeof appSettingsSchema>;
type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

interface ValidatedDefaults {
  catalog: CatalogData;
  settings: AppSettings;
  payment: PaymentSettings;
}

interface PreflightResult extends ValidatedDefaults {
  sourceImagesDirectory: string;
  sourceImagesRealPath: string;
  sourceImageFiles: string[];
}

function isContainedBy(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath.length === 0 ||
    (!isAbsolute(relativePath) &&
      relativePath !== '..' &&
      !relativePath.startsWith(`..\\`) &&
      !relativePath.startsWith('../'))
  );
}

function assertAllowedImageFile(path: string): void {
  if (!allowedImageExtensions.has(extname(path).toLowerCase())) {
    throw new Error(`Unsupported default image file: ${path}`);
  }
}

async function lstatIfExists(path: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function assertRegularSourceFile(path: string, sourceRootRealPath: string): Promise<void> {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) throw new Error(`Source defaults must not contain links: ${path}`);
  if (!stats.isFile()) throw new Error(`Source default is not a regular file: ${path}`);

  const realPath = await realpath(path);
  if (!isContainedBy(sourceRootRealPath, realPath)) {
    throw new Error(`Source default escapes its root: ${path}`);
  }

  await access(path, constants.R_OK);
}

async function readValidatedJson<T>(
  path: string,
  schema: z.ZodType<T>,
  sourceRootRealPath: string,
): Promise<T> {
  await assertRegularSourceFile(path, sourceRootRealPath);
  return schema.parse(JSON.parse(await readFile(path, 'utf8')));
}

async function validateDefaults(defaultsDirectory: string): Promise<ValidatedDefaults> {
  const defaultsStats = await lstat(defaultsDirectory);
  if (defaultsStats.isSymbolicLink()) {
    throw new Error(`Source defaults directory must not be a link: ${defaultsDirectory}`);
  }
  if (!defaultsStats.isDirectory()) {
    throw new Error(`Source defaults path is not a directory: ${defaultsDirectory}`);
  }

  const sourceRootRealPath = await realpath(defaultsDirectory);
  const [catalog, settings, payment] = await Promise.all([
    readValidatedJson(
      join(defaultsDirectory, 'catalog.json'),
      catalogDataSchema,
      sourceRootRealPath,
    ),
    readValidatedJson(
      join(defaultsDirectory, 'settings.json'),
      appSettingsSchema,
      sourceRootRealPath,
    ),
    readValidatedJson(
      join(defaultsDirectory, 'payment.json'),
      paymentSettingsSchema,
      sourceRootRealPath,
    ),
  ]);

  return { catalog, settings, payment };
}

async function scanSourceImageTree(
  directory: string,
  sourceImagesDirectory: string,
  sourceImagesRealPath: string,
): Promise<string[]> {
  const imageFiles: string[] = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    const stats = await lstat(entryPath);

    if (stats.isSymbolicLink()) {
      throw new Error(`Source image tree must not contain links: ${entryPath}`);
    }

    const entryRealPath = await realpath(entryPath);
    if (!isContainedBy(sourceImagesRealPath, entryRealPath)) {
      throw new Error(`Source image entry escapes the images directory: ${entryPath}`);
    }

    if (stats.isDirectory()) {
      imageFiles.push(
        ...(await scanSourceImageTree(entryPath, sourceImagesDirectory, sourceImagesRealPath)),
      );
      continue;
    }

    if (!stats.isFile()) throw new Error(`Source image entry is not a regular file: ${entryPath}`);
    assertAllowedImageFile(entryPath);
    await access(entryPath, constants.R_OK);
    imageFiles.push(relative(sourceImagesDirectory, entryPath));
  }

  return imageFiles;
}

async function validateSourceImageTree(defaultsDirectory: string): Promise<{
  sourceImagesDirectory: string;
  sourceImagesRealPath: string;
  sourceImageFiles: string[];
}> {
  const defaultsRealPath = await realpath(defaultsDirectory);
  const sourceImagesDirectory = join(defaultsDirectory, 'images');
  const stats = await lstat(sourceImagesDirectory);

  if (stats.isSymbolicLink()) {
    throw new Error(`Source images directory must not be a link: ${sourceImagesDirectory}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Source images path is not a directory: ${sourceImagesDirectory}`);
  }

  const sourceImagesRealPath = await realpath(sourceImagesDirectory);
  if (!isContainedBy(defaultsRealPath, sourceImagesRealPath)) {
    throw new Error(`Source images directory escapes defaults: ${sourceImagesDirectory}`);
  }

  return {
    sourceImagesDirectory,
    sourceImagesRealPath,
    sourceImageFiles: await scanSourceImageTree(
      sourceImagesDirectory,
      sourceImagesDirectory,
      sourceImagesRealPath,
    ),
  };
}

function collectImageReferences({
  catalog,
  settings,
  payment,
}: ValidatedDefaults): string[] {
  const references = catalog.products.flatMap(({ thumbnailImage, detailImages }) => [
    thumbnailImage,
    ...detailImages,
  ]);

  if (settings.welcomeBackgroundImage.length > 0) {
    references.push(settings.welcomeBackgroundImage);
  }
  if (payment.qrImage.length > 0) references.push(payment.qrImage);

  return references;
}

async function validateReferencedImages(
  references: string[],
  paths: UserDataPaths,
  sourceImagesDirectory: string,
  sourceImagesRealPath: string,
): Promise<void> {
  for (const reference of new Set(references)) {
    const destinationPath = resolveImagePath(paths, reference);
    const imageRelativePath = relative(paths.imagesDirectory, destinationPath);
    const sourcePath = resolve(sourceImagesDirectory, imageRelativePath);

    try {
      assertAllowedImageFile(sourcePath);
      await assertRegularSourceFile(sourcePath, sourceImagesRealPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Referenced default image is missing: ${reference}`, { cause: error });
      }
      throw error;
    }
  }
}

async function assertSafeDestinationPath(
  paths: UserDataPaths,
  targetPath: string,
  targetKind: 'directory' | 'file',
): Promise<void> {
  const relativeTarget = relative(paths.userData, targetPath);
  if (!isContainedBy(paths.userData, targetPath)) {
    throw new Error(`Destination escapes user data: ${targetPath}`);
  }

  const rootStats = await lstatIfExists(paths.userData);
  if (!rootStats) return;
  if (rootStats.isSymbolicLink()) {
    throw new Error(`User data path must not be a link: ${paths.userData}`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`User data path is not a directory: ${paths.userData}`);
  }
  const rootRealPath = await realpath(paths.userData);

  let currentPath = paths.userData;
  const components = relativeTarget.split(/[\\/]+/u).filter(Boolean);

  for (const [index, component] of components.entries()) {
    currentPath = join(currentPath, component);
    const stats = await lstatIfExists(currentPath);
    if (!stats) break;
    if (stats.isSymbolicLink()) {
      throw new Error(`Destination path must not contain links: ${currentPath}`);
    }

    const currentRealPath = await realpath(currentPath);
    if (!isContainedBy(rootRealPath, currentRealPath)) {
      throw new Error(`Destination path escapes user data: ${currentPath}`);
    }

    const isTarget = index === components.length - 1;
    if (!isTarget && !stats.isDirectory()) {
      throw new Error(`Destination parent is not a directory: ${currentPath}`);
    }
    if (isTarget && targetKind === 'directory' && !stats.isDirectory()) {
      throw new Error(`Destination is not a directory: ${currentPath}`);
    }
    if (isTarget && targetKind === 'file' && !stats.isFile()) {
      throw new Error(`Destination is not a regular file: ${currentPath}`);
    }
  }
}

async function preflightDestination(
  paths: UserDataPaths,
  sourceImageFiles: string[],
): Promise<void> {
  await Promise.all([
    assertSafeDestinationPath(paths, paths.catalogFile, 'file'),
    assertSafeDestinationPath(paths, paths.settingsFile, 'file'),
    assertSafeDestinationPath(paths, paths.paymentFile, 'file'),
    assertSafeDestinationPath(paths, paths.imagesDirectory, 'directory'),
    ...sourceImageFiles.map((sourceRelativePath) =>
      assertSafeDestinationPath(
        paths,
        resolveImagePath(paths, join('images', sourceRelativePath)),
        'file',
      ),
    ),
  ]);
}

async function preflightDefaults(
  defaultsDirectory: string,
  paths: UserDataPaths,
): Promise<PreflightResult> {
  const validatedDefaults = await validateDefaults(defaultsDirectory);
  const sourceImages = await validateSourceImageTree(defaultsDirectory);
  await validateReferencedImages(
    collectImageReferences(validatedDefaults),
    paths,
    sourceImages.sourceImagesDirectory,
    sourceImages.sourceImagesRealPath,
  );
  await preflightDestination(paths, sourceImages.sourceImageFiles);

  return { ...validatedDefaults, ...sourceImages };
}

async function writeDefaultIfMissing<T>(
  paths: UserDataPaths,
  filePath: string,
  schema: z.ZodType<T>,
  value: T,
): Promise<void> {
  await createAtomicJsonStore({
    filePath,
    schema,
    beforePublish: () => assertSafeDestinationPath(paths, filePath, 'file'),
  }).writeIfAbsent(value);
}

async function copyMissingImages(
  sourceImagesDirectory: string,
  sourceImagesRealPath: string,
  sourceImageFiles: string[],
  paths: UserDataPaths,
  dependencies?: Partial<AtomicFileInstallDependencies>,
): Promise<void> {
  for (const sourceRelativePath of sourceImageFiles) {
    const sourcePath = join(sourceImagesDirectory, sourceRelativePath);
    const targetPath = resolveImagePath(paths, join('images', sourceRelativePath));
    await assertRegularSourceFile(sourcePath, sourceImagesRealPath);
    await assertSafeDestinationPath(paths, targetPath, 'file');
    await copyFileIfAbsentAtomic({
      sourcePath,
      targetPath,
      // This closes ordinary initialization races. Atomically validating every ancestor
      // with the hard-link syscall is not available in Node; malicious concurrent
      // same-user junction mutation is outside this local-app trust boundary.
      beforePublish: () => assertSafeDestinationPath(paths, targetPath, 'file'),
      ...(dependencies ? { dependencies } : {}),
    });
  }
}

export async function initializeUserData({
  app,
  defaultsDirectory,
  dependencies,
}: InitializeUserDataOptions): Promise<UserDataPaths> {
  const paths = createUserDataPaths(app);
  await recoverPendingRestores(paths);
  const preflight = await preflightDefaults(defaultsDirectory, paths);

  await mkdir(paths.imagesDirectory, { recursive: true });
  await writeDefaultIfMissing(paths, paths.catalogFile, catalogDataSchema, preflight.catalog);
  await writeDefaultIfMissing(paths, paths.settingsFile, appSettingsSchema, preflight.settings);
  await writeDefaultIfMissing(paths, paths.paymentFile, paymentSettingsSchema, preflight.payment);
  await copyMissingImages(
    preflight.sourceImagesDirectory,
    preflight.sourceImagesRealPath,
    preflight.sourceImageFiles,
    paths,
    dependencies?.imageInstall,
  );

  return paths;
}
