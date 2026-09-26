import path from 'node:path';

export function resolveDefaultsDirectory({
  isPackaged,
  resourcesPath,
  developmentRoot,
}: {
  isPackaged: boolean;
  resourcesPath: string;
  developmentRoot: string;
}): string {
  const root = isPackaged ? resourcesPath : developmentRoot;
  return path.resolve(root, 'data/defaults');
}
