import { join } from 'node:path';
import { exec } from './exec.ts';

/**
 * "Iniciar com o Windows" per distro: a value in the user's Run key that, at logon, starts the distro
 * and keeps it running. A distro with no process left is shut down by WSL after a few seconds, so the
 * command is a hidden wsl.exe that never returns: `conhost --headless` gives it no window, and the
 * loop is plain POSIX sh, so it works in any distro (Alpine's busybox included). Stopping the distro
 * (Parar, or wsl --shutdown) ends it too; it comes back at the next logon.
 *
 * Nothing runs elevated and nothing is installed: removing the value (or the distro) undoes it.
 */

const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
/** Value names: the prefix plus the distro name (letters, digits, dot, hyphen, underscore). */
const prefix = 'WSL-Config.Start.';
const keepAlive = 'while :; do sleep 3600; done';

const system32 = () => join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');

/** The command Windows runs at logon for this distro. */
export function startCommand(name: string): string {
  return `"${join(system32(), 'conhost.exe')}" --headless "${join(system32(), 'wsl.exe')}" -d ${name} --exec /bin/sh -c "${keepAlive}"`;
}

/** Distro names in `reg query` output of the Run key. */
export function parseRunValues(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+REG_(?:EXPAND_)?SZ\s/.exec(line);
    if (match?.[1].startsWith(prefix)) names.push(match[1].slice(prefix.length));
  }
  return names;
}

let cache: Set<string> | null = null;

async function read(): Promise<Set<string>> {
  const result = await exec('reg.exe', ['query', runKey], { timeoutMs: 15_000 });
  // An empty Run key may not exist at all: that is "nothing set", not an error.
  return new Set(result.code === 0 ? parseRunValues(result.stdout).map((name) => name.toLowerCase()) : []);
}

/** Distros set to start with Windows (lowercase names; WSL names are case-insensitive). Cached. */
export async function autostartSet(): Promise<Set<string>> {
  cache ??= await read().catch(() => new Set<string>());
  return cache;
}

export async function setAutostart(name: string, enabled: boolean): Promise<void> {
  const args = enabled
    ? ['add', runKey, '/v', prefix + name, '/t', 'REG_SZ', '/d', startCommand(name), '/f']
    : ['delete', runKey, '/v', prefix + name, '/f'];
  const result = await exec('reg.exe', args, { timeoutMs: 15_000 });
  cache = null;
  // Deleting a value that isn't there fails the same way: that is already the wanted state.
  if (result.code !== 0 && enabled) {
    throw new Error(`Não foi possível ${enabled ? 'ligar' : 'desligar'} o início com o Windows: ${result.stderr.trim() || `código ${result.code}`}`);
  }
}
