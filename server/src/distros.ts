import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { wslConfFields, readFields, writeFields, type FieldValues } from './configModel.ts';
import { launch } from './exec.ts';
import { say, state, updateState, type Distro } from './events.ts';
import { parseIni, setValue, getValue, toText } from './ini.ts';
import { startJob, type JobContext } from './jobs.ts';
import { findDistro, refreshStatus } from './status.ts';
import { getSettings, newId } from './store.ts';
import { HttpError } from './validation.ts';
import * as wsl from './wsl.ts';

export async function requireDistro(name: string): Promise<Distro> {
  let distro = findDistro(name);
  if (!distro) {
    await refreshStatus(true);
    distro = findDistro(name);
  }
  if (!distro) throw new HttpError(404, `Distro "${name}" não encontrada`);
  return distro;
}

export async function requireFreeName(name: string): Promise<void> {
  await refreshStatus(true);
  if (findDistro(name)) throw new HttpError(409, `Já existe uma distro chamada "${name}"`);
}

/** Folder of a new distro: the one chosen, or <distros folder>\<name>. */
export async function installLocation(name: string, location: string): Promise<string> {
  const target = location || join((await getSettings()).distrosDir, name);
  await mkdir(target, { recursive: true });
  return target;
}

export function markPending(kind: 'vm' | string): void {
  if (kind === 'vm') {
    if (state.vm.running) updateState({ pending: { ...state.pending, vm: true } });
    return;
  }
  const distro = findDistro(kind);
  if (distro?.running && !state.pending.distros.includes(distro.name)) {
    updateState({ pending: { ...state.pending, distros: [...state.pending.distros, distro.name] } });
  }
}

// ------------------------------------------------------------------ quick actions

export async function start(name: string): Promise<void> {
  const distro = await requireDistro(name);
  say(`==> Iniciando ${distro.name}`);
  await wsl.startDistro(distro.name);
  await refreshStatus();
}

export async function stop(name: string): Promise<void> {
  const distro = await requireDistro(name);
  say(`==> Parando ${distro.name}`);
  await wsl.terminate(distro.name);
  await refreshStatus();
}

export async function makeDefault(name: string): Promise<void> {
  const distro = await requireDistro(name);
  await wsl.setDefault(distro.name);
  say(`[OK] ${distro.name} agora é a distro padrão`, 'ok');
  await refreshStatus(true);
}

/** Windows Terminal when installed, otherwise a console window. */
export async function openTerminal(name: string): Promise<void> {
  const distro = await requireDistro(name);
  try {
    await launch('wt.exe', ['-w', 'new', 'nt', '--title', distro.name, 'wsl.exe', '-d', distro.name, '--cd', '~']);
  } catch {
    await launch('cmd.exe', ['/c', 'start', '', 'wsl.exe', '-d', distro.name, '--cd', '~']);
  }
}

/** The distro's files in Explorer (\\wsl.localhost\<name>). */
export async function openFiles(name: string): Promise<void> {
  const distro = await requireDistro(name);
  await launch('explorer.exe', [`\\\\wsl.localhost\\${distro.name}`]);
}

// ------------------------------------------------------------------ inside the distro

export async function inside(name: string, allowStart: boolean): Promise<wsl.DistroInside & { values: FieldValues }> {
  const distro = await requireDistro(name);
  if (!distro.running && !allowStart) throw new HttpError(409, 'A distro está parada');
  const result = await wsl.inspect(distro.name);
  void refreshStatus();
  return { ...result, values: readFields(parseIni(result.wslConf), wslConfFields) };
}

export async function saveWslConf(name: string, change: { values?: FieldValues; text?: string }): Promise<void> {
  const distro = await requireDistro(name);
  let text = change.text;
  if (text === undefined) {
    const current = await wsl.inspect(distro.name);
    text = toText(writeFields(parseIni(current.wslConf), wslConfFields, change.values ?? {}));
  }
  await wsl.writeWslConf(distro.name, text);
  say(`[OK] wsl.conf de ${distro.name} salvo (o anterior ficou em /etc/wsl.conf.bak)`, 'ok');
  markPending(distro.name);
}

/**
 * Sets the default user in the registry. [user] default in wsl.conf wins over it, so when that key
 * exists it is updated too; otherwise the change would silently do nothing.
 */
export async function setDefaultUser(name: string, user: string): Promise<void> {
  const distro = await requireDistro(name);
  const current = await wsl.inspect(distro.name);
  if (!current.users.some((item) => item.name === user)) throw new HttpError(400, `O usuário "${user}" não existe em ${distro.name}`);
  await wsl.setDefaultUser(distro.name, user);
  const doc = parseIni(current.wslConf);
  if (getValue(doc, 'user', 'default') !== undefined) {
    await wsl.writeWslConf(distro.name, toText(setValue(doc, 'user', 'default', user)));
    markPending(distro.name);
  }
  say(`[OK] Usuário padrão de ${distro.name}: ${user}`, 'ok');
  await refreshStatus(true);
}

// ------------------------------------------------------------------ disk

/**
 * Operations on the disk file itself (move, resize, vhd export) need it detached, and the WSL 2 VM
 * keeps the disk of every distro that ran attached until the whole VM shuts down; stopping the
 * distro is not enough. The user has to agree to shut WSL down (it closes every distro).
 */
export function requireDetachedDisks(shutdownFirst: boolean): void {
  if (state.vm.running && !shutdownFirst) {
    throw new HttpError(409, 'A VM do WSL está ligada e mantém o disco preso. Confirme o desligamento do WSL para continuar.');
  }
}

export async function releaseDisks(shutdownFirst: boolean, context: JobContext): Promise<void> {
  if (!shutdownFirst) return;
  context.log('Desligando o WSL para soltar os discos...');
  await wsl.shutdown();
}

export async function move(name: string, location: string, shutdownFirst: boolean): Promise<void> {
  const distro = await requireDistro(name);
  requireDetachedDisks(shutdownFirst);
  startJob([distro.name], `Movendo ${distro.name} para ${location}`, async (context) => {
    await releaseDisks(shutdownFirst, context);
    await mkdir(location, { recursive: true });
    const stopWatch = context.watchFile(join(location, 'ext4.vhdx'), distro.vhdSize);
    try {
      await wsl.moveDistro(distro.name, location, { onLine: context.log });
    } finally {
      stopWatch();
    }
    return `${distro.name} movida para ${location}`;
  }, { global: shutdownFirst });
}

export async function resize(name: string, sizeGb: number, shutdownFirst: boolean): Promise<void> {
  const distro = await requireDistro(name);
  if (distro.version !== 2) throw new HttpError(400, 'Só distros WSL 2 têm disco virtual');
  requireDetachedDisks(shutdownFirst);
  startJob([distro.name], `Redimensionando o disco de ${distro.name} para ${sizeGb} GB`, async (context) => {
    await releaseDisks(shutdownFirst, context);
    await wsl.resizeDisk(distro.name, sizeGb);
    return `Disco de ${distro.name}: ${sizeGb} GB`;
  }, { global: shutdownFirst });
}

// ------------------------------------------------------------------ create/remove

export async function remove(name: string): Promise<void> {
  const distro = await requireDistro(name);
  startJob([distro.name], `Excluindo ${distro.name}`, async (context) => {
    await wsl.unregister(distro.name, { onLine: context.log });
    return `${distro.name} excluída`;
  });
}

/** Creates a distro from a file; the progress is the new disk growing in its folder. */
export async function importFrom(name: string, file: string, vhd: boolean, location: string, context: JobContext): Promise<void> {
  const target = await installLocation(name, location);
  const stopWatch = context.watchFile(join(target, 'ext4.vhdx'));
  try {
    await wsl.importDistro(name, target, file, vhd, { onLine: context.log });
  } finally {
    stopWatch();
  }
}

export async function duplicate(name: string, newName: string, location: string): Promise<void> {
  const distro = await requireDistro(name);
  await requireFreeName(newName);
  const settings = await getSettings();
  const tempDir = join(settings.backupsDir, '.tmp');
  const tempFile = join(tempDir, `${distro.name}-${newId()}.tar`);

  startJob([distro.name, newName], `Duplicando ${distro.name} como ${newName}`, async (context) => {
    await mkdir(tempDir, { recursive: true });
    try {
      context.log('Exportando...');
      const stopWatch = context.watchFile(tempFile);
      try {
        await wsl.exportDistro(distro.name, tempFile, 'tar', { onLine: context.log });
      } finally {
        stopWatch();
      }
      context.log('Importando a cópia...');
      await importFrom(newName, tempFile, false, location, context);
    } finally {
      await rm(tempFile, { force: true });
    }
    return `${newName} criada a partir de ${distro.name}`;
  });
}

export async function installOnline(distro: string, name: string, location: string): Promise<void> {
  await requireFreeName(name);
  const target = await installLocation(name, location);
  startJob([name], `Instalando ${distro} como ${name}`, async (context) => {
    await wsl.installOnline(distro, name, target, { onLine: context.log });
    return `${name} instalada. Abra o terminal para criar o usuário.`;
  });
}

export async function importFile(name: string, file: string, location: string): Promise<void> {
  await requireFreeName(name);
  startJob([name], `Criando ${name} a partir de ${file}`, async (context) => {
    await importFrom(name, file, /\.vhdx?$/i.test(file), location, context);
    return `${name} criada`;
  });
}
