// @vitest-environment node

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import forgeConfig from '../forge.config';
import { resolveDefaultsDirectory } from './defaultsDirectory';

describe('default data packaging', () => {
  it('resolves source defaults in development and packaged resources in production', () => {
    expect(
      resolveDefaultsDirectory({
        isPackaged: false,
        resourcesPath: 'C:/installed/resources',
        developmentRoot: 'C:/repo',
      }),
    ).toBe(path.resolve('C:/repo', 'data/defaults'));
    expect(
      resolveDefaultsDirectory({
        isPackaged: true,
        resourcesPath: 'C:/installed/resources',
        developmentRoot: 'C:/repo',
      }),
    ).toBe(path.resolve('C:/installed/resources', 'data/defaults'));
  });

  it('copies defaults beside app.asar as a packaged resource', () => {
    expect(forgeConfig.packagerConfig?.extraResource).toContain('data');
  });
});
