import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('landscape presentation frame', () => {
  it('centers the app in a 9:16 frame on landscape displays', async () => {
    const css = await readFile(path.resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

    expect(css).toContain('@media (min-aspect-ratio: 1 / 1)');
    expect(css).toContain('.kiosk-frame');
    expect(css).toContain('width: min(100vw, calc(100dvh * 9 / 16));');
    expect(css).toContain('margin: 0 auto;');
  });
});
