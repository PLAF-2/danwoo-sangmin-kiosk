import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMediaRequestHandler,
  registerMediaSchemePrivileges,
} from './mediaProtocol';
import { createUserDataPaths } from './storage/paths';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('kiosk-media protocol', () => {
  it('registers only the secure media scheme before app readiness', () => {
    const registerSchemesAsPrivileged = vi.fn();
    registerMediaSchemePrivileges({ registerSchemesAsPrivileged });

    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'kiosk-media',
        privileges: { standard: true, secure: true, supportFetchAPI: true },
      },
    ]);
  });

  it('serves shipped and imported files beneath userData images with correct content types', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'highest-protocol-'));
    directories.push(userData);
    const paths = createUserDataPaths({ getPath: () => userData });
    await mkdir(join(paths.imagesDirectory, 'products'), { recursive: true });
    await writeFile(join(paths.imagesDirectory, 'horizon-album.svg'), Buffer.from('<svg/>'));
    await writeFile(join(paths.imagesDirectory, 'products', 'imported-id.png'), Buffer.from('png-data'));
    const handle = createMediaRequestHandler(paths);

    const shipped = await handle(new Request('kiosk-media://images/horizon-album.svg'));
    const imported = await handle(new Request('kiosk-media://images/products/imported-id.png'));

    expect(shipped.status).toBe(200);
    expect(shipped.headers.get('content-type')).toBe('image/svg+xml');
    expect(Buffer.from(await shipped.arrayBuffer()).toString()).toBe('<svg/>');
    expect(imported.status).toBe(200);
    expect(imported.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await imported.arrayBuffer()).toString()).toBe('png-data');
  });

  it('denies traversal and linked paths outside the owned image directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'highest-protocol-'));
    directories.push(root);
    const userData = join(root, 'user-data');
    const outside = join(root, 'outside');
    const paths = createUserDataPaths({ getPath: () => userData });
    await mkdir(paths.imagesDirectory, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.png'), Buffer.from('secret'));
    await symlink(outside, join(paths.imagesDirectory, 'linked'), 'junction');
    const handle = createMediaRequestHandler(paths);

    const traversal = await handle(
      new Request('kiosk-media://images/%2e%2e%2fadmin-credentials.json'),
    );
    const linked = await handle(new Request('kiosk-media://images/linked/secret.png'));
    const wrongHost = await handle(new Request('kiosk-media://other/secret.png'));

    expect(traversal.status).toBe(403);
    expect(linked.status).toBe(403);
    expect(wrongHost.status).toBe(403);
  });
});
