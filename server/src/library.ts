import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { importFrom, releaseDisks, requireDetachedDisks, requireDistro, requireFreeName } from './distros.ts';
import { launch } from './exec.ts';
import { dataChanged } from './events.ts';
import type { Distro } from './events.ts';
import { startJob, type JobContext } from './jobs.ts';
import { findDistro, refreshStatus } from './status.ts';
import { getSettings, mutate, newId, readData, type BackupEntry, type ImageEntry } from './store.ts';
import { badRequest, HttpError, type ExportFormat } from './validation.ts';
import * as wsl from './wsl.ts';

const extensions: Record<ExportFormat, string> = { tar: '.tar', 'tar.gz': '.tar.gz', 'tar.xz': '.tar.xz', vhd: '.vhdx' };

/** Format of an image or backup file, from its name. */
export function formatOf(file: string): ExportFormat {
  const name = file.toLowerCase();
  if (/\.vhdx?$/.test(name)) return 'vhd';
  if (/\.(tar\.gz|tgz)$/.test(name)) return 'tar.gz';
  if (/\.(tar\.xz|txz)$/.test(name)) return 'tar.xz';
  if (name.endsWith('.tar')) return 'tar';
  throw badRequest('Formato não suportado: use .tar, .tar.gz, .tar.xz ou .vhdx');
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

/**
 * Exports a distro with progress. A vhd export copies the disk file itself, which the WSL 2 VM keeps
 * attached until it shuts down (see requireDetachedDisks): that one needs WSL off.
 */
async function exportWithProgress(distro: Distro, file: string, format: ExportFormat, shutdownFirst: boolean, context: JobContext): Promise<void> {
  if (format === 'vhd') await releaseDisks(shutdownFirst, context);
  const stopWatch = context.watchFile(file, format === 'vhd' ? distro.vhdSize : null);
  try {
    await wsl.exportDistro(distro.name, file, format, { onLine: context.log });
  } catch (error) {
    await rm(file, { force: true });
    if (format === 'vhd' && /SHARING_VIOLATION/.test((error as Error).message)) {
      throw new HttpError(409, `A VM do WSL voltou a segurar o disco de ${distro.name} antes da cópia. Tente de novo, ou use tar.gz.`);
    }
    throw error;
  } finally {
    stopWatch();
  }
}

async function sizeOf(file: string): Promise<number> {
  return (await stat(file)).size;
}

/** Images and backups as listed in the UI, flagging files that were deleted outside the app. */
export async function publicData() {
  const data = await readData();
  const exists = (file: string) => existsSync(file);
  return {
    settings: data.settings,
    images: data.images.map((image) => ({ ...image, exists: exists(image.file) })),
    backups: data.backups.map((backup) => ({ ...backup, exists: exists(backup.file) })),
  };
}

export async function revealFile(file: string): Promise<void> {
  if (!existsSync(file)) throw new HttpError(404, 'O arquivo não existe mais');
  await launch('explorer.exe', [`/select,${file}`]);
}

// ------------------------------------------------------------------ backups

export async function createBackup(name: string, format: ExportFormat, note: string, shutdownFirst: boolean): Promise<void> {
  const distro = await requireDistro(name);
  if (format === 'vhd') requireDetachedDisks(shutdownFirst);
  const { backupsDir } = await getSettings();
  const folder = join(backupsDir, distro.name);
  const file = join(folder, `${distro.name}-${stamp()}${extensions[format]}`);
  const global = format === 'vhd' && shutdownFirst;

  startJob([distro.name], `Backup de ${distro.name} (${format})`, async (context) => {
    await mkdir(folder, { recursive: true });
    await exportWithProgress(distro, file, format, shutdownFirst, context);
    const entry: BackupEntry = { id: newId(), distro: distro.name, file, format, size: await sizeOf(file), createdAt: new Date().toISOString(), note };
    await mutate((data) => {
      data.backups.unshift(entry);
    });
    dataChanged();
    return `Backup de ${distro.name} salvo`;
  }, { global });
}

async function getBackup(id: string): Promise<BackupEntry> {
  const backup = (await readData()).backups.find((item) => item.id === id);
  if (!backup) throw new HttpError(404, 'Backup não encontrado');
  if (!existsSync(backup.file)) throw new HttpError(404, 'O arquivo do backup não existe mais');
  return backup;
}

/** Restores as a new distro. */
export async function restoreAsNew(id: string, name: string, location: string): Promise<void> {
  const backup = await getBackup(id);
  await requireFreeName(name);
  startJob([name], `Restaurando o backup de ${backup.distro} como ${name}`, async (context) => {
    await importFrom(name, backup.file, backup.format === 'vhd', location, context);
    return `${name} restaurada`;
  });
}

/**
 * Replaces the distro with the backup: unregisters it (its disk is deleted) and imports the
 * backup under the same name and folder. The backup file stays, so a failed import can be retried.
 */
export async function restoreReplacing(id: string): Promise<void> {
  const backup = await getBackup(id);
  await refreshStatus(true);
  const current = findDistro(backup.distro);
  const location = current?.basePath ?? '';

  startJob([backup.distro], `Substituindo ${backup.distro} pelo backup de ${new Date(backup.createdAt).toLocaleString('pt-BR')}`, async (context) => {
    if (current) {
      context.log(`Excluindo a versão atual de ${current.name}...`);
      await wsl.unregister(current.name, { onLine: context.log });
    }
    await importFrom(backup.distro, backup.file, backup.format === 'vhd', location, context);
    return `${backup.distro} restaurada a partir do backup`;
  });
}

export async function deleteBackup(id: string): Promise<void> {
  const backup = (await readData()).backups.find((item) => item.id === id);
  if (!backup) throw new HttpError(404, 'Backup não encontrado');
  await rm(backup.file, { force: true });
  await mutate((data) => {
    data.backups = data.backups.filter((item) => item.id !== id);
  });
  dataChanged();
}

// ------------------------------------------------------------------ images

async function addImage(entry: Omit<ImageEntry, 'id' | 'addedAt'>): Promise<ImageEntry> {
  const image: ImageEntry = { id: newId(), addedAt: new Date().toISOString(), ...entry };
  await mutate((data) => {
    data.images.unshift(image);
  });
  dataChanged();
  return image;
}

/** Adds a file that already exists on disk; it stays where it is. */
export async function registerImage(file: string, name: string): Promise<ImageEntry> {
  if (!existsSync(file)) throw badRequest('Arquivo não encontrado');
  const format = formatOf(file);
  const data = await readData();
  if (data.images.some((image) => image.file.toLowerCase() === file.toLowerCase())) throw new HttpError(409, 'Esta imagem já está na biblioteca');
  return addImage({ name: name || basename(file), file, format, size: await sizeOf(file), source: 'file', origin: file });
}

export async function downloadImage(url: URL, name: string): Promise<void> {
  const fileName = decodeURIComponent(basename(url.pathname));
  const format = formatOf(fileName);
  const { imagesDir } = await getSettings();
  const file = join(imagesDir, fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'));
  if (existsSync(file)) throw new HttpError(409, `Já existe ${file}`);

  startJob([], `Baixando ${fileName}`, async (context) => {
    await mkdir(imagesDir, { recursive: true });
    const partial = `${file}.part`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`Download falhou (HTTP ${response.status})`);
    const total = Number(response.headers.get('content-length')) || null;
    let bytes = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        context.progress(bytes, total);
        controller.enqueue(chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body.pipeThrough(counter) as never), createWriteStream(partial));
      await rename(partial, file);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    await addImage({ name: name || fileName, file, format, size: await sizeOf(file), source: 'download', origin: url.href });
    return `${fileName} baixada`;
  });
}

/** Saves a distro as an image (a template to create others from). */
export async function imageFromDistro(name: string, imageName: string, format: ExportFormat, shutdownFirst: boolean): Promise<void> {
  const distro = await requireDistro(name);
  if (format === 'vhd') requireDetachedDisks(shutdownFirst);
  const { imagesDir } = await getSettings();
  const file = join(imagesDir, `${distro.name}-${stamp()}${extensions[format]}`);
  const global = format === 'vhd' && shutdownFirst;

  startJob([distro.name], `Salvando ${distro.name} como imagem`, async (context) => {
    await mkdir(imagesDir, { recursive: true });
    await exportWithProgress(distro, file, format, shutdownFirst, context);
    await addImage({ name: imageName || `${distro.name} (${new Date().toLocaleDateString('pt-BR')})`, file, format, size: await sizeOf(file), source: 'export', origin: distro.name });
    return `Imagem de ${distro.name} salva`;
  }, { global });
}

export async function createFromImage(id: string, name: string, location: string): Promise<void> {
  const image = (await readData()).images.find((item) => item.id === id);
  if (!image) throw new HttpError(404, 'Imagem não encontrada');
  if (!existsSync(image.file)) throw new HttpError(404, 'O arquivo da imagem não existe mais');
  await requireFreeName(name);
  startJob([name], `Criando ${name} a partir de ${image.name}`, async (context) => {
    await importFrom(name, image.file, image.format === 'vhd', location, context);
    return `${name} criada a partir de ${image.name}`;
  });
}

/** Removes an image from the library; the file is only deleted when asked (it may live elsewhere). */
export async function deleteImage(id: string, deleteFile: boolean): Promise<void> {
  const image = (await readData()).images.find((item) => item.id === id);
  if (!image) throw new HttpError(404, 'Imagem não encontrada');
  if (deleteFile) await rm(image.file, { force: true });
  await mutate((data) => {
    data.images = data.images.filter((item) => item.id !== id);
  });
  dataChanged();
}

export async function findImage(id: string): Promise<ImageEntry> {
  const image = (await readData()).images.find((item) => item.id === id);
  if (!image) throw new HttpError(404, 'Imagem não encontrada');
  return image;
}

export async function findBackup(id: string): Promise<BackupEntry> {
  const backup = (await readData()).backups.find((item) => item.id === id);
  if (!backup) throw new HttpError(404, 'Backup não encontrado');
  return backup;
}
