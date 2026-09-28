import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import { ownedImagePathSchema } from '../../src/domain';

export interface ElectronPathProvider {
  getPath(name: 'userData'): string;
}

export interface UserDataPaths {
  userData: string;
  catalogFile: string;
  settingsFile: string;
  paymentFile: string;
  imagesDirectory: string;
  ordersDirectory: string;
  adminCredentialsFile: string;
}

export function createUserDataPaths(app: ElectronPathProvider): UserDataPaths {
  const userData = resolve(app.getPath('userData'));

  return {
    userData,
    catalogFile: join(userData, 'catalog.json'),
    settingsFile: join(userData, 'settings.json'),
    paymentFile: join(userData, 'payment.json'),
    imagesDirectory: join(userData, 'images'),
    ordersDirectory: join(userData, 'orders'),
    adminCredentialsFile: join(userData, 'admin-credentials.json'),
  };
}

export function resolveImagePath(paths: UserDataPaths, storedPath: string): string {
  if (!ownedImagePathSchema.safeParse(storedPath).success || posix.isAbsolute(storedPath) || win32.isAbsolute(storedPath)) {
    throw new Error(`Unsafe image path: ${storedPath}`);
  }

  const portablePath = storedPath.replace(/[\\/]+/g, sep);
  const candidate = resolve(paths.userData, portablePath);
  const imageRelativePath = relative(paths.imagesDirectory, candidate);

  if (
    imageRelativePath.length === 0 ||
    imageRelativePath === '..' ||
    imageRelativePath.startsWith(`..\\`) ||
    imageRelativePath.startsWith('../') ||
    isAbsolute(imageRelativePath)
  ) {
    throw new Error(`Unsafe image path: ${storedPath}`);
  }

  return candidate;
}
