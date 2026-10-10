import { powershell } from './exec.ts';

// The page can't learn real file paths (browsers hide them), so the server opens the native
// Windows dialogs. TopMost owner: otherwise the dialog may open behind the app window.
const prelude = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
`;

const filters = {
  image: 'Imagens do WSL (*.tar, *.tar.gz, *.tar.xz, *.vhdx)|*.tar;*.tar.gz;*.tgz;*.tar.xz;*.txz;*.vhdx;*.vhd|Todos os arquivos|*.*',
  any: 'Todos os arquivos|*.*',
};

async function show(script: string): Promise<string | null> {
  const result = await powershell(prelude + script, { sta: true, timeoutMs: 600_000 });
  const path = result.stdout.trim();
  return result.code === 0 && path ? path : null;
}

export function pickFile(kind: keyof typeof filters): Promise<string | null> {
  return show(`
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = '${filters[kind]}'
if ($dialog.ShowDialog($owner) -eq 'OK') { $dialog.FileName }`);
}

export function pickFolder(): Promise<string | null> {
  return show(`
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog($owner) -eq 'OK') { $dialog.SelectedPath }`);
}
