import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dataFile, defaultBackupsDir, defaultDistrosDir, defaultImagesDir, paths } from './paths.ts';
import type { ExportFormat } from './validation.ts';

/** Where the app puts new distros, backups and images. */
export interface Settings {
  distrosDir: string;
  backupsDir: string;
  imagesDir: string;
  backupFormat: ExportFormat;
}

/** A root filesystem (tar, tar.gz, tar.xz) or disk (vhdx) that new distros can be created from. */
export interface ImageEntry {
  id: string;
  name: string;
  file: string;
  format: ExportFormat;
  size: number;
  addedAt: string;
  /** How it got here: a file picked from disk, a download, or an export of a distro. */
  source: 'file' | 'download' | 'export';
  origin: string;
}

export interface BackupEntry {
  id: string;
  distro: string;
  file: string;
  format: ExportFormat;
  size: number;
  createdAt: string;
  note: string;
}

export interface Data {
  settings: Settings;
  images: ImageEntry[];
  backups: BackupEntry[];
}

export const newId = () => randomBytes(4).toString('hex');

function emptyData(): Data {
  return {
    settings: {
      distrosDir: defaultDistrosDir(),
      backupsDir: defaultBackupsDir(),
      imagesDir: defaultImagesDir(),
      backupFormat: 'tar.gz',
    },
    images: [],
    backups: [],
  };
}

async function writeData(data: Data): Promise<void> {
  await mkdir(paths.dataDir, { recursive: true });
  const tmp = dataFile() + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, dataFile());
}

export async function readData(): Promise<Data> {
  if (!existsSync(dataFile())) return emptyData();
  const saved = JSON.parse(await readFile(dataFile(), 'utf8')) as Partial<Data>;
  const defaults = emptyData();
  return {
    settings: { ...defaults.settings, ...saved.settings },
    images: saved.images ?? [],
    backups: saved.backups ?? [],
  };
}

// Serialize writes so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const data = await readData();
    const result = await fn(data);
    await writeData(data);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

export async function getSettings(): Promise<Settings> {
  return (await readData()).settings;
}
