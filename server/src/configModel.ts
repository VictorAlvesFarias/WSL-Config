import { getValue, setValue, type IniDocument } from './ini.ts';

/**
 * Typed view over an INI file. Each field maps to one section/key; null means "not set", so WSL
 * uses its own default. Sizes travel in MB.
 */
export type FieldKind = 'bool' | 'int' | 'size' | 'text' | 'enum';

export interface FieldSpec {
  name: string;
  section: string;
  key: string;
  kind: FieldKind;
  /** enum: accepted values, compared ignoring case and written as listed here. */
  options?: readonly string[];
  min?: number;
  max?: number;
}

export type FieldValue = boolean | number | string | null;
export type FieldValues = Record<string, FieldValue>;

const unquote = (raw: string) => raw.replace(/^"(.*)"$/, '$1').trim();

/** "8GB", "4096MB", "8 gb", "512KB", "0" or plain bytes -> MB. */
export function parseSizeMb(raw: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([KMGT]?B?)?$/i.exec(unquote(raw));
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toUpperCase().replace(/B$/, '');
  const factor: Record<string, number> = { '': 1 / (1024 * 1024), K: 1 / 1024, M: 1, G: 1024, T: 1024 * 1024 };
  return Math.round(amount * factor[unit]);
}

export function formatSize(mb: number): string {
  return mb > 0 && mb % 1024 === 0 ? `${mb / 1024}GB` : `${mb}MB`;
}

function parseBool(raw: string): boolean | null {
  const value = unquote(raw).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return null;
}

/** A value the field can't understand reads as null, and is only replaced when the user sets the field. */
export function parseField(spec: FieldSpec, raw: string | undefined): FieldValue {
  if (raw === undefined) return null;
  switch (spec.kind) {
    case 'bool':
      return parseBool(raw);
    case 'int': {
      const value = Number(unquote(raw));
      return Number.isInteger(value) ? value : null;
    }
    case 'size':
      return parseSizeMb(raw);
    case 'enum':
      return spec.options?.find((option) => option.toLowerCase() === unquote(raw).toLowerCase()) ?? null;
    case 'text':
      return unquote(raw);
  }
}

function formatField(spec: FieldSpec, value: FieldValue): string | undefined {
  if (value === null || value === '') return undefined;
  if (spec.kind === 'size') return formatSize(value as number);
  return String(value);
}

export function readFields(doc: IniDocument, specs: readonly FieldSpec[]): FieldValues {
  const values: FieldValues = {};
  for (const spec of specs) values[spec.name] = parseField(spec, getValue(doc, spec.section, spec.key));
  return values;
}

/**
 * Writes only the fields whose value changed, so untouched keys keep their exact text
 * (e.g. "networkingMode=NAT" isn't rewritten as "nat").
 */
export function writeFields(doc: IniDocument, specs: readonly FieldSpec[], values: FieldValues): IniDocument {
  const current = readFields(doc, specs);
  let next = doc;
  for (const spec of specs) {
    if (!(spec.name in values) || values[spec.name] === current[spec.name]) continue;
    next = setValue(next, spec.section, spec.key, formatField(spec, values[spec.name]));
  }
  return next;
}

// ------------------------------------------------------------------ .wslconfig

/** %UserProfile%\.wslconfig: one VM shared by every WSL 2 distro. */
export const wslConfigFields: readonly FieldSpec[] = [
  { name: 'memory', section: 'wsl2', key: 'memory', kind: 'size', min: 256 },
  { name: 'processors', section: 'wsl2', key: 'processors', kind: 'int', min: 1, max: 512 },
  { name: 'swap', section: 'wsl2', key: 'swap', kind: 'size', min: 0 },
  { name: 'swapFile', section: 'wsl2', key: 'swapFile', kind: 'text' },
  { name: 'defaultVhdSize', section: 'wsl2', key: 'defaultVhdSize', kind: 'size', min: 1024 },
  { name: 'vmIdleTimeout', section: 'wsl2', key: 'vmIdleTimeout', kind: 'int', min: -1, max: 86_400_000 },
  { name: 'localhostForwarding', section: 'wsl2', key: 'localhostForwarding', kind: 'bool' },
  { name: 'nestedVirtualization', section: 'wsl2', key: 'nestedVirtualization', kind: 'bool' },
  { name: 'guiApplications', section: 'wsl2', key: 'guiApplications', kind: 'bool' },
  { name: 'networkingMode', section: 'wsl2', key: 'networkingMode', kind: 'enum', options: ['NAT', 'mirrored', 'virtioproxy', 'none'] },
  { name: 'dnsTunneling', section: 'wsl2', key: 'dnsTunneling', kind: 'bool' },
  { name: 'firewall', section: 'wsl2', key: 'firewall', kind: 'bool' },
  { name: 'autoProxy', section: 'wsl2', key: 'autoProxy', kind: 'bool' },
  { name: 'kernelCommandLine', section: 'wsl2', key: 'kernelCommandLine', kind: 'text' },
  { name: 'autoMemoryReclaim', section: 'experimental', key: 'autoMemoryReclaim', kind: 'enum', options: ['disabled', 'gradual', 'dropCache'] },
  // sparseVhd is left out on purpose: WSL 2.7 disabled sparse disks over possible data corruption.
];

// ------------------------------------------------------------------ /etc/wsl.conf

/** /etc/wsl.conf inside one distro. [user] default is handled by the default-user action. */
export const wslConfFields: readonly FieldSpec[] = [
  { name: 'systemd', section: 'boot', key: 'systemd', kind: 'bool' },
  { name: 'bootCommand', section: 'boot', key: 'command', kind: 'text' },
  { name: 'automountEnabled', section: 'automount', key: 'enabled', kind: 'bool' },
  { name: 'automountRoot', section: 'automount', key: 'root', kind: 'text' },
  { name: 'automountOptions', section: 'automount', key: 'options', kind: 'text' },
  { name: 'mountFsTab', section: 'automount', key: 'mountFsTab', kind: 'bool' },
  { name: 'hostname', section: 'network', key: 'hostname', kind: 'text' },
  { name: 'generateHosts', section: 'network', key: 'generateHosts', kind: 'bool' },
  { name: 'generateResolvConf', section: 'network', key: 'generateResolvConf', kind: 'bool' },
  { name: 'interopEnabled', section: 'interop', key: 'enabled', kind: 'bool' },
  { name: 'appendWindowsPath', section: 'interop', key: 'appendWindowsPath', kind: 'bool' },
  { name: 'useWindowsTimezone', section: 'time', key: 'useWindowsTimezone', kind: 'bool' },
];
