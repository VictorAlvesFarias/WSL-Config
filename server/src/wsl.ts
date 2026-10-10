import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { exec, powershell, type ExecOptions, type ExecResult } from './exec.ts';
import { HttpError, type ExportFormat } from './validation.ts';

// Makes wsl.exe print its own messages as UTF-8 instead of UTF-16.
const wslEnv = { WSL_UTF8: '1' };
const quick = 30_000;

export function wsl(args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return exec('wsl.exe', args, { ...options, env: { ...wslEnv, ...options.env } });
}

/**
 * Runs a program inside the distro. --exec skips the default shell, so every argument arrives
 * literally (with "--" wsl.exe would hand the joined line to a shell).
 */
export function wslExec(distro: string, args: string[], options: ExecOptions & { user?: string } = {}) {
  const user = options.user ? ['-u', options.user] : [];
  return wsl(['-d', distro, ...user, '--exec', ...args], options);
}

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/** Turns a failed wsl.exe call into an error carrying its own message (the last meaningful lines). */
export function ensureOk(result: ExecResult, action: string): ExecResult {
  if (result.code === 0) return result;
  const message = lines(`${result.stdout}\n${result.stderr}`).slice(-3).join(' ');
  throw new HttpError(500, `${action} falhou${message ? `: ${message}` : ` (código ${result.code})`}`);
}

// ------------------------------------------------------------------ discovery

export interface RegistryDistro {
  id: string;
  name: string;
  version: 1 | 2;
  ready: boolean;
  basePath: string;
  vhdPath: string | null;
  defaultUid: number;
  osVersion: string;
  flavor: string;
}

interface RawRegistry {
  default: string | null;
  items: Array<{
    id: string;
    name: string | null;
    basePath: string | null;
    vhd: string | null;
    uid: number | null;
    version: number | null;
    state: number | null;
    osVersion: string | null;
    flavor: string | null;
  }>;
}

const registryScript = `
$root = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'
$default = (Get-ItemProperty $root -ErrorAction SilentlyContinue).DefaultDistribution
$items = @(Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath
  [pscustomobject]@{ id = $_.PSChildName; name = $p.DistributionName; basePath = $p.BasePath; vhd = $p.VhdFileName;
    uid = $p.DefaultUid; version = $p.Version; state = $p.State; osVersion = $p.OsVersion; flavor = $p.Flavor }
})
[pscustomobject]@{ default = $default; items = $items } | ConvertTo-Json -Depth 3 -Compress`;

/**
 * Distros registered for this Windows user. The registry is the only place with the GUID, folder,
 * disk and default uid, and it reads the same in every Windows language (wsl.exe -l -v doesn't).
 */
export async function readRegistry(): Promise<{ defaultId: string | null; distros: RegistryDistro[] }> {
  const result = await powershell(registryScript, { timeoutMs: quick });
  if (result.code !== 0 || !result.stdout.trim()) throw new Error(`Não foi possível ler o registro do WSL: ${result.stderr.trim()}`);
  const raw = JSON.parse(result.stdout) as RawRegistry;
  const distros = raw.items
    .filter((item) => item.name)
    .map((item) => {
      const basePath = (item.basePath ?? '').replace(/^\\\\\?\\/, '');
      const version = item.version === 1 ? 1 : 2;
      return {
        id: item.id,
        name: item.name as string,
        version,
        ready: item.state === 1,
        basePath,
        vhdPath: version === 2 && basePath ? join(basePath, item.vhd || 'ext4.vhdx') : null,
        defaultUid: item.uid ?? 0,
        osVersion: item.osVersion ?? '',
        flavor: item.flavor ?? '',
      } satisfies RegistryDistro;
    });
  return { defaultId: raw.default, distros };
}

/** Names from wsl.exe -l -q. With no distros wsl.exe prints a message and fails: that is an empty list. */
async function listNames(running: boolean): Promise<string[]> {
  const result = await wsl(['-l', ...(running ? ['--running'] : []), '-q'], { timeoutMs: quick });
  if (result.code !== 0) return [];
  return lines(result.stdout);
}

export const listAll = () => listNames(false);
export const listRunning = () => listNames(true);

export async function fileSize(path: string | null): Promise<number | null> {
  if (!path) return null;
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/** Memory of the WSL 2 VM (vmmemWSL), from tasklist; null when the VM is off or hidden. */
export async function vmMemory(): Promise<number | null> {
  const result = await exec('tasklist.exe', ['/fi', 'IMAGENAME eq vmmemWSL', '/fo', 'csv', '/nh'], { timeoutMs: quick });
  const row = lines(result.stdout).find((line) => line.startsWith('"vmmemWSL"'));
  if (!row) return null;
  const memory = row.split('","').at(-1)?.replace(/\D/g, '');
  return memory ? Number(memory) * 1024 : null;
}

export async function wslVersion(): Promise<{ installed: boolean; version: string | null; details: string[] }> {
  try {
    const result = await wsl(['--version'], { timeoutMs: quick });
    const details = lines(result.stdout);
    return { installed: result.code === 0, version: /(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(details[0] ?? '')?.[1] ?? null, details };
  } catch {
    return { installed: false, version: null, details: [] };
  }
}

/** Distros offered by wsl --install (NAME and FRIENDLY NAME columns). */
export async function onlineDistros(): Promise<Array<{ name: string; friendlyName: string }>> {
  const result = ensureOk(await wsl(['-l', '-o'], { timeoutMs: 60_000 }), 'Buscar a lista online');
  const all = lines(result.stdout);
  const header = all.findIndex((line) => /^NAME\s+FRIENDLY NAME$/i.test(line));
  return all
    .slice(header + 1)
    .map((line) => /^(\S+)\s+(.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ name: match[1], friendlyName: match[2] }));
}

// ------------------------------------------------------------------ lifecycle

export async function startDistro(name: string): Promise<void> {
  ensureOk(await wslExec(name, ['/bin/sh', '-c', 'exit 0'], { timeoutMs: 120_000 }), `Iniciar ${name}`);
}

export async function terminate(name: string): Promise<void> {
  ensureOk(await wsl(['--terminate', name], { timeoutMs: 120_000 }), `Parar ${name}`);
}

export async function shutdown(): Promise<void> {
  ensureOk(await wsl(['--shutdown'], { timeoutMs: 180_000 }), 'Desligar o WSL');
}

export async function setDefault(name: string): Promise<void> {
  ensureOk(await wsl(['--set-default', name], { timeoutMs: quick }), `Definir ${name} como padrão`);
}

export async function unregister(name: string, options: ExecOptions = {}): Promise<void> {
  ensureOk(await wsl(['--unregister', name], { timeoutMs: 600_000, ...options }), `Excluir ${name}`);
}

export async function exportDistro(name: string, file: string, format: ExportFormat, options: ExecOptions = {}): Promise<void> {
  ensureOk(await wsl(['--export', name, file, '--format', format], options), `Exportar ${name}`);
}

/** Creates a distro from a tar (any compression) or, with vhd, from a copy of a .vhdx. */
export async function importDistro(name: string, location: string, file: string, vhd: boolean, options: ExecOptions = {}): Promise<void> {
  const args = ['--import', name, location, file, '--version', '2', ...(vhd ? ['--vhd'] : [])];
  ensureOk(await wsl(args, options), `Importar ${name}`);
}

/** Downloads straight from the web (no Store) and skips the first launch, which asks for a user. */
export async function installOnline(distro: string, name: string, location: string, options: ExecOptions = {}): Promise<void> {
  const args = ['--install', distro, '--name', name, '--location', location, '--web-download', '--no-launch'];
  ensureOk(await wsl(args, options), `Instalar ${distro}`);
}

export async function moveDistro(name: string, location: string, options: ExecOptions = {}): Promise<void> {
  ensureOk(await wsl(['--manage', name, '--move', location], options), `Mover ${name}`);
}

export async function resizeDisk(name: string, sizeGb: number): Promise<void> {
  ensureOk(await wsl(['--manage', name, '--resize', `${sizeGb}GB`], { timeoutMs: 600_000 }), `Redimensionar o disco de ${name}`);
}

export async function setDefaultUser(name: string, user: string): Promise<void> {
  ensureOk(await wsl(['--manage', name, '--set-default-user', user], { timeoutMs: quick }), `Definir o usuário padrão de ${name}`);
}

// ------------------------------------------------------------------ inside a distro

export interface DistroInside {
  os: string;
  kernel: string;
  disk: { total: number; used: number; available: number } | null;
  users: Array<{ name: string; uid: number }>;
  wslConf: string;
}

// Runs as root with /bin/sh so it works on minimal distros (Alpine has no bash). Fixed text: no input reaches it.
const inspectScript = [
  "echo '@@OS'; (. /etc/os-release 2>/dev/null; echo \"${PRETTY_NAME:-$NAME}\")",
  "echo '@@KERNEL'; uname -r",
  "echo '@@DF'; df -Pk / | tail -n 1",
  "echo '@@USERS'; awk -F: '$3 == 0 || ($3 >= 1000 && $3 < 65534) { print $1 \":\" $3 }' /etc/passwd",
  // A missing wsl.conf (Alpine ships none) is an empty file, not a failure.
  "echo '@@CONF'; cat /etc/wsl.conf 2>/dev/null",
  'exit 0',
].join('; ');

/** OS, disk usage, users and wsl.conf of a distro. Starts it when stopped. */
export async function inspect(name: string): Promise<DistroInside> {
  const result = ensureOk(await wslExec(name, ['/bin/sh', '-c', inspectScript], { user: 'root', timeoutMs: 120_000 }), `Ler ${name}`);
  const sections: Record<string, string[]> = {};
  let current = '';
  for (const line of result.stdout.split(/\r?\n/)) {
    const marker = /^@@(\w+)$/.exec(line);
    if (marker) {
      current = marker[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  const df = (sections.DF ?? []).join(' ').trim().split(/\s+/);
  const kb = (index: number) => Number(df[index]) * 1024;
  return {
    os: (sections.OS ?? []).join('').trim(),
    kernel: (sections.KERNEL ?? []).join('').trim(),
    disk: df.length >= 4 && Number.isFinite(kb(1)) ? { total: kb(1), used: kb(2), available: kb(3) } : null,
    users: (sections.USERS ?? [])
      .map((line) => /^([^:]+):(\d+)$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => ({ name: match[1], uid: Number(match[2]) })),
    wslConf: (sections.CONF ?? []).join('\n').replace(/\n+$/, ''),
  };
}

/** Replaces /etc/wsl.conf, keeping the previous one as /etc/wsl.conf.bak. The text goes through stdin. */
export async function writeWslConf(name: string, text: string): Promise<void> {
  const script = 'cp -p /etc/wsl.conf /etc/wsl.conf.bak 2>/dev/null; cat > /etc/wsl.conf';
  ensureOk(await wslExec(name, ['/bin/sh', '-c', script], { user: 'root', input: text, timeoutMs: 120_000 }), `Salvar o wsl.conf de ${name}`);
}
