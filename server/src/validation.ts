import { isAbsolute } from 'node:path';
import type { FieldSpec, FieldValues } from './configModel.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);

export type Body = Record<string, unknown>;

export const exportFormats = ['tar', 'tar.gz', 'tar.xz', 'vhd'] as const;
export type ExportFormat = (typeof exportFormats)[number];

// Values reach wsl.exe as separate arguments (never through a shell) and are shown in the UI:
// no control characters, and none of the characters that would matter if one ever reached a shell.
const unsafe = /["$`\r\n\0]/;

export function text(body: Body, field: string, label: string, { required = false, max = 200, pattern = undefined as RegExp | undefined, patternMessage = '' } = {}): string {
  const raw = body[field];
  if (raw !== undefined && raw !== null && typeof raw !== 'string') throw badRequest(`${label} inválido`);
  const value = (raw ?? '').trim();
  if (required && !value) throw badRequest(`${label} é obrigatório`);
  if (value.length > max) throw badRequest(`${label} é muito longo`);
  if (unsafe.test(value)) throw badRequest(`${label} não pode conter aspas, $ ou \``);
  if (value && pattern && !pattern.test(value)) throw badRequest(patternMessage || `${label} inválido`);
  return value;
}

/** WSL accepts letters, digits, dot, dash and underscore in distro names. */
export function distroName(value: unknown, label = 'Nome da distro'): string {
  return text({ value }, 'value', label, {
    required: true,
    max: 64,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    patternMessage: `${label} inválido: use letras, números, ponto, hífen e sublinhado`,
  });
}

/** An absolute Windows path (C:\... or \\server\share\...). */
export function windowsPath(value: unknown, label: string, { required = true } = {}): string {
  const path = text({ value }, 'value', label, { required, max: 260 });
  if (path && (!isAbsolute(path) || !/^([A-Za-z]:\\|\\\\)/.test(path))) throw badRequest(`${label} deve ser um caminho completo do Windows (ex.: D:\\WSL)`);
  return path;
}

export function linuxUser(value: unknown): string {
  return text({ value }, 'value', 'Usuário', {
    required: true,
    max: 32,
    pattern: /^[a-z_][a-z0-9_-]{0,31}$/,
    patternMessage: 'Usuário inválido (minúsculas, números, _ e -)',
  });
}

export function exportFormat(value: unknown): ExportFormat {
  if (!exportFormats.includes(value as ExportFormat)) throw badRequest('Formato inválido (tar, tar.gz, tar.xz ou vhd)');
  return value as ExportFormat;
}

/** Disk size typed as GB in the UI ("256" or "256GB"). */
export function diskSizeGb(value: unknown): number {
  const size = typeof value === 'string' ? Number(value.replace(/\s*GB$/i, '')) : value;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > 16_384) throw badRequest('Tamanho deve ser um número inteiro de GB (1 a 16384)');
  return size;
}

/** Validates the values sent for a typed INI form; unknown names are ignored. */
export function fieldValues(body: Body, specs: readonly FieldSpec[]): FieldValues {
  const values: FieldValues = {};
  for (const spec of specs) {
    if (!(spec.name in body)) continue;
    const value = body[spec.name];
    if (value === null || value === '') {
      values[spec.name] = null;
      continue;
    }
    switch (spec.kind) {
      case 'bool':
        if (typeof value !== 'boolean') throw badRequest(`${spec.key}: valor inválido`);
        break;
      case 'int':
      case 'size':
        if (typeof value !== 'number' || !Number.isInteger(value)) throw badRequest(`${spec.key}: deve ser um número inteiro`);
        if (spec.min !== undefined && value < spec.min) throw badRequest(`${spec.key}: mínimo ${spec.min}`);
        if (spec.max !== undefined && value > spec.max) throw badRequest(`${spec.key}: máximo ${spec.max}`);
        break;
      case 'enum':
        if (!spec.options?.includes(value as string)) throw badRequest(`${spec.key}: use ${spec.options?.join(', ')}`);
        break;
      case 'text':
        if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 500) throw badRequest(`${spec.key}: texto inválido`);
        break;
    }
    values[spec.name] = typeof value === 'string' ? value.trim() : (value as boolean | number);
  }
  return values;
}

/** Whole-file edits (raw mode): no NULs, and small enough to be a config file. */
export function configText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw badRequest(`${label} inválido`);
  if (value.includes('\0')) throw badRequest(`${label} contém caracteres inválidos`);
  if (value.length > 64_000) throw badRequest(`${label} é grande demais`);
  return value;
}

export function httpsUrl(value: unknown): URL {
  const raw = text({ value }, 'value', 'URL', { required: true, max: 2000 });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('URL inválida');
  }
  if (url.protocol !== 'https:') throw badRequest('Use uma URL https://');
  return url;
}

/** Name typed by the user to confirm a destructive action. */
export function confirmed(body: Body, expected: string): void {
  if (body.confirm !== expected) throw badRequest(`Digite "${expected}" para confirmar`);
}
