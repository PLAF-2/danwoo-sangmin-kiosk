import { lstat, readFile, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

import type { UserDataPaths } from './storage/paths';
import { createConsistencyLock, type ConsistencyLock } from './ipc/consistencyLock';

export const KIOSK_MEDIA_SCHEME = 'kiosk-media';

interface ProtocolPrivilegesRegistrar {
  registerSchemesAsPrivileged(
    schemes: Array<{
      scheme: string;
      privileges: { standard: boolean; secure: boolean; supportFetchAPI: boolean };
    }>,
  ): void;
}

const contentTypes = new Map([
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function isContainedBy(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath.length > 0 &&
    !isAbsolute(relativePath) &&
    relativePath !== '..' &&
    !relativePath.startsWith('../') &&
    !relativePath.startsWith('..\\')
  );
}

export function registerMediaSchemePrivileges(protocol: ProtocolPrivilegesRegistrar): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: KIOSK_MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

export function createMediaRequestHandler(
  paths: UserDataPaths,
  consistencyLock: ConsistencyLock = createConsistencyLock(),
): (request: Request) => Promise<Response> {
  return (request) => consistencyLock.withRead(async () => {
    try {
      const url = new URL(request.url);
      if (url.protocol !== `${KIOSK_MEDIA_SCHEME}:` || url.hostname !== 'images') {
        return new Response(null, { status: 403 });
      }

      const decodedPath = decodeURIComponent(url.pathname);
      if (decodedPath.includes('\\') || decodedPath.includes('\0')) {
        return new Response(null, { status: 403 });
      }

      const segments = decodedPath.split('/').filter(Boolean);
      if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
        return new Response(null, { status: 403 });
      }

      const imagesRoot = await realpath(paths.imagesDirectory);
      const candidate = resolve(paths.imagesDirectory, ...segments);
      if (!isContainedBy(imagesRoot, candidate)) return new Response(null, { status: 403 });

      const stats = await lstat(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) return new Response(null, { status: 403 });

      const candidateRealPath = await realpath(candidate);
      if (!isContainedBy(imagesRoot, candidateRealPath)) {
        return new Response(null, { status: 403 });
      }

      const contentType = contentTypes.get(extname(candidate).toLowerCase());
      if (!contentType) return new Response(null, { status: 415 });
      // Stable links are rejected above. As with user-data initialization, malicious
      // concurrent same-user junction mutation is outside this local-app trust boundary.
      return new Response(await readFile(candidate), {
        status: 200,
        headers: { 'content-type': contentType },
      });
    } catch (error) {
      if (
        error instanceof URIError ||
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as NodeJS.ErrnoException).code === 'ENOTDIR'
      ) {
        return new Response(null, { status: error instanceof URIError ? 403 : 404 });
      }
      throw error;
    }
  });
}
