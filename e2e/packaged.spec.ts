import { type ChildProcess, spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const productName = 'HIGHEST Kiosk';

async function resolvePackagedExecutable(): Promise<string> {
  const packageDirectory = path.resolve(
    'out',
    `${productName}-${process.platform}-${process.arch}`,
  );
  const candidates =
    process.platform === 'win32'
      ? [path.join(packageDirectory, `${productName}.exe`)]
      : process.platform === 'darwin'
        ? [
            path.join(
              packageDirectory,
              `${productName}.app`,
              'Contents',
              'MacOS',
              productName,
            ),
          ]
        : [
            path.join(packageDirectory, productName),
            path.join(packageDirectory, 'highest-kiosk'),
          ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next platform-specific executable name.
    }
  }

  throw new Error(`Packaged executable not found. Checked: ${candidates.join(', ')}`);
}

async function waitForTextFile(filePath: string, processLogs: () => string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const value = await readFile(filePath, 'utf8');
      if (value.trim().length > 0) return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Packaged app did not create ${filePath}.\n${processLogs()}`);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(child.exitCode !== null);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  if (await waitForExit(child, 5_000)) return;

  if (process.platform === 'win32' && child.pid) {
    const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await waitForExit(taskkill, 5_000);
  } else {
    child.kill('SIGKILL');
  }

  if (!(await waitForExit(child, 5_000))) {
    throw new Error(`Packaged app process ${child.pid ?? '<unknown>'} did not exit`);
  }
}

test('boots the packaged app and initializes displayable defaults', async () => {
  const executablePath = await resolvePackagedExecutable();
  const userData = await mkdtemp(path.join(tmpdir(), 'highest-packaged-e2e-'));
  let logs = '';
  const child = spawn(
    executablePath,
    ['--remote-debugging-port=0', `--user-data-dir=${userData}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  child.stdout?.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    const devToolsFile = await waitForTextFile(
      path.join(userData, 'DevToolsActivePort'),
      () => logs,
    );
    const [port] = devToolsFile.trim().split(/\r?\n/u);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

    try {
      const context = browser.contexts()[0];
      expect(context).toBeDefined();
      await expect.poll(() => context?.pages().length ?? 0).toBeGreaterThan(0);
      const page = context?.pages()[0];
      expect(page).toBeDefined();
      if (!page) throw new Error('Packaged app did not create a renderer page');

      await expect(page.getByRole('heading', { name: 'HIGHEST Kiosk' })).toBeVisible();

      const catalog = JSON.parse(await readFile(path.join(userData, 'catalog.json'), 'utf8')) as {
        products: Array<{ thumbnailImage: string }>;
      };
      expect(catalog.products[0]?.thumbnailImage).toBe('images/horizon-album.svg');
      await expect(access(path.join(userData, 'images', 'horizon-album.svg'))).resolves.toBeUndefined();

      await page.evaluate(() => {
        const browserGlobal = globalThis as typeof globalThis & {
          document: {
            body: { append(node: unknown): void };
            createElement(tag: 'img'): { dataset: Record<string, string>; src: string };
          };
        };
        const image = browserGlobal.document.createElement('img');
        image.dataset.testid = 'packaged-default-image';
        image.src = 'kiosk-media://images/horizon-album.svg';
        browserGlobal.document.body.append(image);
      });
      await expect
        .poll(() =>
          page.locator('[data-testid="packaged-default-image"]').evaluate(
            (image) => (image as unknown as { naturalWidth: number }).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
    } finally {
      await browser.close();
    }
  } finally {
    await stopProcess(child);
    await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
