/**
 * Minimal INI editor for .wslconfig and /etc/wsl.conf that keeps everything it doesn't touch:
 * comments, blank lines, unknown keys, key casing, the BOM and the line endings. Other tools
 * (WSL-Vpn, for one) write these files too, so rewriting them from a model would lose their notes.
 */
export interface IniDocument {
  lines: string[];
  bom: boolean;
  newline: string;
}

const sectionLine = /^\s*\[([^\]]+)\]\s*(?:[#;].*)?$/;
const keyLine = /^\s*([^=#;\s][^=]*?)\s*=\s*(.*?)\s*$/;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function parseIni(text: string): IniDocument {
  const bom = text.startsWith('﻿');
  const body = bom ? text.slice(1) : text;
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  // A trailing newline leaves an empty last element; toText puts it back.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { lines, bom, newline };
}

export function toText(doc: IniDocument): string {
  const body = doc.lines.length ? doc.lines.join(doc.newline) + doc.newline : '';
  return (doc.bom ? '﻿' : '') + body;
}

interface Located {
  /** Index of the key line, or -1. */
  index: number;
  /** Index of the section header, or -1 when the section doesn't exist. */
  sectionIndex: number;
  /** Index after the last key of the section (where a new key goes). */
  insertAt: number;
}

function locate(doc: IniDocument, section: string, key: string): Located {
  let current: string | null = null;
  const result: Located = { index: -1, sectionIndex: -1, insertAt: -1 };

  doc.lines.forEach((line, index) => {
    const header = sectionLine.exec(line);
    if (header) {
      current = header[1].trim();
      if (same(current, section) && result.sectionIndex < 0) {
        result.sectionIndex = index;
        result.insertAt = index + 1;
      }
      return;
    }
    if (current === null || !same(current, section)) return;
    const pair = keyLine.exec(line);
    if (!pair) return;
    result.insertAt = index + 1;
    if (same(pair[1], key)) result.index = index;
  });

  return result;
}

/** Raw value of a key (quotes included), or undefined when absent. Section and key ignore case. */
export function getValue(doc: IniDocument, section: string, key: string): string | undefined {
  const { index } = locate(doc, section, key);
  if (index < 0) return undefined;
  return keyLine.exec(doc.lines[index])?.[2];
}

/** Sets a key (undefined removes it), creating the section at the end when needed. */
export function setValue(doc: IniDocument, section: string, key: string, value: string | undefined): IniDocument {
  const lines = [...doc.lines];
  const found = locate(doc, section, key);

  if (found.index >= 0) {
    if (value === undefined) {
      lines.splice(found.index, 1);
    } else {
      const [, indent] = /^(\s*)/.exec(lines[found.index]) ?? ['', ''];
      const [, originalKey, originalValue] = keyLine.exec(lines[found.index]) ?? [];
      const quoted = /^".*"$/.test(originalValue ?? '') && !/^".*"$/.test(value);
      lines[found.index] = `${indent}${originalKey ?? key}=${quoted ? `"${value}"` : value}`;
    }
    return { ...doc, lines };
  }

  if (value === undefined) return doc;

  if (found.sectionIndex >= 0) {
    lines.splice(found.insertAt, 0, `${key}=${value}`);
  } else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(`[${section}]`, `${key}=${value}`);
  }
  return { ...doc, lines };
}

/** Every section with its keys, in file order (for the raw view and the tests). */
export function readSections(doc: IniDocument): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let current: string | null = null;
  for (const line of doc.lines) {
    const header = sectionLine.exec(line);
    if (header) {
      current = header[1].trim();
      sections[current] ??= {};
      continue;
    }
    const pair = current === null ? null : keyLine.exec(line);
    if (pair && current !== null) sections[current][pair[1]] = pair[2];
  }
  return sections;
}
