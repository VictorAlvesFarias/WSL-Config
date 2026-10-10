const units = ['B', 'KB', 'MB', 'GB', 'TB'];

export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit++;
  }
  return `${amount.toLocaleString('pt-BR', { maximumFractionDigits: amount >= 100 || unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

export const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function elapsed(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}min ${String(seconds % 60).padStart(2, '0')}s` : `${seconds}s`;
}

export const formatLabels: Record<string, string> = {
  tar: 'tar',
  'tar.gz': 'tar.gz (menor)',
  'tar.xz': 'tar.xz (bem menor, mais lento)',
  vhd: 'vhdx (cópia do disco; desliga o WSL)',
};

/** A distro name derived from free text (image name, friendly name). */
export const suggestName = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.(tar(\.gz|\.xz)?|tgz|txz|vhdx?)$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+|-+$/g, '')
    .slice(0, 64);
