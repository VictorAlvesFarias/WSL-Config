import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { readFields, wslConfigFields, writeFields, type FieldValues } from './configModel.ts';
import { markPending } from './distros.ts';
import { say } from './events.ts';
import { parseIni, toText } from './ini.ts';
import { paths } from './paths.ts';
import { badRequest } from './validation.ts';

const historyLimit = 10;

export const hostInfo = () => ({ memoryMb: Math.floor(totalmem() / (1024 * 1024)), processors: cpus().length });

async function readText(): Promise<string> {
  return existsSync(paths.wslConfigFile) ? readFile(paths.wslConfigFile, 'utf8') : '';
}

export async function readWslConfig() {
  const text = await readText();
  return {
    path: paths.wslConfigFile,
    exists: existsSync(paths.wslConfigFile),
    text: text.replace(/^﻿/, ''),
    values: readFields(parseIni(text), wslConfigFields),
    host: hostInfo(),
  };
}

/** Keeps the last versions in <data>\wslconfig-history, so a bad edit can be undone by hand. */
async function keepHistory(): Promise<void> {
  if (!existsSync(paths.wslConfigFile)) return;
  const folder = join(paths.dataDir, 'wslconfig-history');
  await mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  await copyFile(paths.wslConfigFile, join(folder, `wslconfig-${stamp}.bak`));
  const files = (await readdir(folder)).filter((name) => name.endsWith('.bak')).sort();
  for (const old of files.slice(0, -historyLimit)) await rm(join(folder, old), { force: true });
}

async function write(text: string): Promise<void> {
  await keepHistory();
  await writeFile(paths.wslConfigFile, text, 'utf8');
  say(`[OK] ${paths.wslConfigFile} salvo. Vale depois de reiniciar o WSL.`, 'ok');
  markPending('vm');
}

/** Saves the form: only the changed keys are rewritten, everything else stays as it was. */
export async function saveWslConfigValues(values: FieldValues): Promise<void> {
  const host = hostInfo();
  if (typeof values.memory === 'number' && values.memory > host.memoryMb) throw badRequest(`Memória acima do total do PC (${Math.round(host.memoryMb / 1024)} GB)`);
  if (typeof values.processors === 'number' && values.processors > host.processors) throw badRequest(`O PC tem ${host.processors} processadores lógicos`);
  const text = await readText();
  await write(toText(writeFields(parseIni(text), wslConfigFields, values)));
}

export async function saveWslConfigText(text: string): Promise<void> {
  const current = await readText();
  const original = parseIni(current);
  // Keep the BOM and line endings the file already had (the textarea only sends \n).
  await write(toText({ ...parseIni(text), bom: original.bom, newline: current ? original.newline : '\r\n' }));
}
