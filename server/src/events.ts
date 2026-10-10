export type LogLevel = 'info' | 'step' | 'ok' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

/** A distro as Windows registers it (HKCU\...\Lxss) plus whether it is running. */
export interface Distro {
  id: string;
  name: string;
  version: 1 | 2;
  running: boolean;
  isDefault: boolean;
  /** Registry state: 1 is installed; anything else means it is being installed/removed/converted. */
  ready: boolean;
  basePath: string;
  /** ext4.vhdx of a WSL 2 distro (null for WSL 1). */
  vhdPath: string | null;
  vhdSize: number | null;
  defaultUid: number;
  osVersion: string;
  flavor: string;
}

/** Long operation (export, import, move...) shown with its progress. */
export interface Job {
  id: string;
  /** Distro the job locks; null for jobs that only touch files (downloads). */
  distro: string | null;
  label: string;
  /** Touches the whole WSL (shutdown): nothing else may run meanwhile. */
  global: boolean;
  startedAt: string;
  /** Bytes written so far, when the job can measure it. */
  bytes: number | null;
  /** Expected total, when known (makes the bar determinate). */
  total: number | null;
}

export interface VmStatus {
  running: boolean;
  /** Working set of the WSL 2 VM process (vmmemWSL), in bytes. */
  memory: number | null;
}

/** Saved configuration that only applies after a restart. */
export interface PendingRestart {
  /** .wslconfig changed: needs wsl --shutdown. */
  vm: boolean;
  /** wsl.conf changed in these distros: each needs to be stopped and started again. */
  distros: string[];
}

export interface PanelState {
  distros: Distro[];
  vm: VmStatus;
  jobs: Job[];
  pending: PendingRestart;
  /** False when the last check failed (WSL missing or not answering). */
  reachable: boolean;
  checkedAt: string | null;
}

export interface Notice {
  kind: 'ok' | 'error';
  message: string;
}

type Listener = (event: 'state' | 'log' | 'data' | 'notice', data: unknown) => void;

const maxLog = 500;
let nextId = 1;
const log: LogEntry[] = [];
const listeners = new Set<Listener>();

export const state: PanelState = {
  distros: [],
  vm: { running: false, memory: null },
  jobs: [],
  pending: { vm: false, distros: [] },
  reachable: false,
  checkedAt: null,
};

function classify(text: string): LogLevel {
  if (/^==>/.test(text)) return 'step';
  if (/^\s*\[OK\]|^Conclu|^Pronto/.test(text)) return 'ok';
  if (/^\s*\[!\]|^AVISO|^Aviso/.test(text)) return 'warn';
  if (/^\s*\[X\]|^ERRO|^FALHA|^Erro|^Falha/.test(text)) return 'error';
  return 'info';
}

export function say(text: string, level?: LogLevel): void {
  const entry: LogEntry = { id: nextId++, time: new Date().toISOString(), level: level ?? classify(text), text: text.trimEnd() };
  log.push(entry);
  if (log.length > maxLog) log.splice(0, log.length - maxLog);
  for (const listener of listeners) listener('log', entry);
}

export function updateState(patch: Partial<PanelState>): void {
  Object.assign(state, patch);
  for (const listener of listeners) listener('state', state);
}

/** Tells the UI that saved data (images, backups, settings) changed and must be reloaded. */
export function dataChanged(): void {
  for (const listener of listeners) listener('data', null);
}

/** Toast in every open window: how background jobs report that they finished. */
export function notify(kind: Notice['kind'], message: string): void {
  for (const listener of listeners) listener('notice', { kind, message } satisfies Notice);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const listenerCount = () => listeners.size;
export const recentLog = (limit = 200) => log.slice(-limit);
