import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const here = import.meta.dirname;

/** Read at call time so the desktop app (and the tests) can point them somewhere else. */
export const paths = {
  dataDir: process.env.WSLCONFIG_HOME ?? join(homedir(), '.wsl-config'),
  /** The global WSL configuration. WSLCONFIG_FILE lets development point at a scratch copy. */
  wslConfigFile: process.env.WSLCONFIG_FILE ?? join(homedir(), '.wslconfig'),
  clientDistDir: resolve(here, '..', '..', 'client', 'dist'),
};

export function configurePaths(overrides: Partial<typeof paths>): void {
  Object.assign(paths, overrides);
}

export const dataFile = () => join(paths.dataDir, 'data.json');
export const defaultDistrosDir = () => join(paths.dataDir, 'distros');
export const defaultBackupsDir = () => join(paths.dataDir, 'backups');
export const defaultImagesDir = () => join(paths.dataDir, 'images');
