import type { AppData, DistroInside, ExportFormat, FieldValues, ImageEntry, OnlineDistro, PortsReport, Settings, SystemInfo, WslConfig } from './types';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      'x-wsl-config': '1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Erro ${response.status}`);
  return data as T;
}

type Ok = { ok: boolean };
const distro = (name: string) => `/distros/${encodeURIComponent(name)}`;

export const api = {
  data: () => request<AppData>('GET', '/data'),
  saveSettings: (settings: Settings) => request<Settings>('PUT', '/settings', settings),
  system: () => request<SystemInfo>('GET', '/system'),
  online: () => request<OnlineDistro[]>('GET', '/online'),
  ports: () => request<PortsReport>('GET', '/ports'),
  shutdown: () => request<Ok>('POST', '/system/shutdown'),
  pickFile: (kind: 'image' | 'any') => request<{ path: string | null }>('POST', '/dialog/file', { kind }),
  pickFolder: () => request<{ path: string | null }>('POST', '/dialog/folder'),

  wslConfig: () => request<WslConfig>('GET', '/wslconfig'),
  saveWslConfig: (values: FieldValues) => request<WslConfig>('PUT', '/wslconfig', values),
  saveWslConfigText: (text: string) => request<WslConfig>('PUT', '/wslconfig/raw', { text }),

  install: (input: { distro: string; name: string; location: string }) => request<Ok>('POST', '/distros/install', input),
  importFile: (input: { name: string; file: string; location: string }) => request<Ok>('POST', '/distros/import', input),
  inside: (name: string, start: boolean) => request<DistroInside>('GET', `${distro(name)}/inside${start ? '?start=1' : ''}`),
  start: (name: string) => request<Ok>('POST', `${distro(name)}/start`),
  stop: (name: string) => request<Ok>('POST', `${distro(name)}/stop`),
  makeDefault: (name: string) => request<Ok>('POST', `${distro(name)}/default`),
  terminal: (name: string) => request<Ok>('POST', `${distro(name)}/terminal`),
  files: (name: string) => request<Ok>('POST', `${distro(name)}/files`),
  saveWslConf: (name: string, values: FieldValues) => request<Ok>('PUT', `${distro(name)}/wslconf`, values),
  saveWslConfText: (name: string, text: string) => request<Ok>('PUT', `${distro(name)}/wslconf/raw`, { text }),
  setUser: (name: string, user: string) => request<Ok>('PUT', `${distro(name)}/user`, { user }),
  move: (name: string, location: string, shutdownFirst: boolean) => request<Ok>('POST', `${distro(name)}/move`, { location, shutdownFirst }),
  resize: (name: string, sizeGb: number, shutdownFirst: boolean) => request<Ok>('POST', `${distro(name)}/resize`, { sizeGb, shutdownFirst }),
  duplicate: (name: string, newName: string, location: string) => request<Ok>('POST', `${distro(name)}/duplicate`, { newName, location }),
  backup: (name: string, format: ExportFormat, note: string, shutdownFirst = false) =>
    request<Ok>('POST', `${distro(name)}/backup`, { format, note, shutdownFirst }),
  saveAsImage: (name: string, imageName: string, format: ExportFormat, shutdownFirst = false) =>
    request<Ok>('POST', `${distro(name)}/image`, { imageName, format, shutdownFirst }),
  remove: (name: string, confirm: string) => request<Ok>('DELETE', distro(name), { confirm }),

  addImage: (file: string, name: string) => request<ImageEntry>('POST', '/images', { file, name }),
  downloadImage: (url: string, name: string) => request<Ok>('POST', '/images/download', { url, name }),
  createFromImage: (id: string, name: string, location: string) => request<Ok>('POST', `/images/${id}/create`, { name, location }),
  revealImage: (id: string) => request<Ok>('POST', `/images/${id}/reveal`),
  deleteImage: (id: string, deleteFile: boolean) => request<Ok>('DELETE', `/images/${id}`, { deleteFile }),

  restoreAsNew: (id: string, name: string, location: string) => request<Ok>('POST', `/backups/${id}/restore`, { mode: 'new', name, location }),
  restoreReplacing: (id: string, confirm: string) => request<Ok>('POST', `/backups/${id}/restore`, { mode: 'replace', confirm }),
  revealBackup: (id: string) => request<Ok>('POST', `/backups/${id}/reveal`),
  deleteBackup: (id: string) => request<Ok>('DELETE', `/backups/${id}`),
};
