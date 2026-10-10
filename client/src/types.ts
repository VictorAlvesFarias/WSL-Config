export type LogLevel = 'info' | 'step' | 'ok' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

export interface Distro {
  id: string;
  name: string;
  version: 1 | 2;
  running: boolean;
  isDefault: boolean;
  ready: boolean;
  basePath: string;
  vhdPath: string | null;
  vhdSize: number | null;
  defaultUid: number;
  osVersion: string;
  flavor: string;
}

export interface Job {
  id: string;
  distro: string | null;
  label: string;
  global: boolean;
  startedAt: string;
  bytes: number | null;
  total: number | null;
}

export interface PanelState {
  distros: Distro[];
  vm: { running: boolean; memory: number | null };
  jobs: Job[];
  pending: { vm: boolean; distros: string[] };
  reachable: boolean;
  checkedAt: string | null;
}

export interface Notice {
  kind: 'ok' | 'error';
  message: string;
}

export type ExportFormat = 'tar' | 'tar.gz' | 'tar.xz' | 'vhd';
export const exportFormats: ExportFormat[] = ['tar.gz', 'tar', 'tar.xz', 'vhd'];

export interface Settings {
  distrosDir: string;
  backupsDir: string;
  imagesDir: string;
  backupFormat: ExportFormat;
}

export interface ImageEntry {
  id: string;
  name: string;
  file: string;
  format: ExportFormat;
  size: number;
  addedAt: string;
  source: 'file' | 'download' | 'export';
  origin: string;
  exists: boolean;
}

export interface BackupEntry {
  id: string;
  distro: string;
  file: string;
  format: ExportFormat;
  size: number;
  createdAt: string;
  note: string;
  exists: boolean;
}

export interface AppData {
  settings: Settings;
  images: ImageEntry[];
  backups: BackupEntry[];
}

export interface SystemInfo {
  host: { memoryMb: number; processors: number };
  wsl: { installed: boolean; version: string | null; details: string[] };
  dataDir: string;
}

export type FieldValue = boolean | number | string | null;
export type FieldValues = Record<string, FieldValue>;

export interface WslConfig {
  path: string;
  exists: boolean;
  text: string;
  values: FieldValues;
  host: { memoryMb: number; processors: number };
}

export interface DistroInside {
  os: string;
  kernel: string;
  disk: { total: number; used: number; available: number } | null;
  users: Array<{ name: string; uid: number }>;
  wslConf: string;
  values: FieldValues;
}

export interface OnlineDistro {
  name: string;
  friendlyName: string;
}
