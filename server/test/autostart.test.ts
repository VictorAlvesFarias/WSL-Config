import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRunValues, startCommand } from '../src/autostart.ts';

test('the Run key listing yields only our distros', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run',
    '    OneDrive    REG_SZ    "C:\Program Files\Microsoft OneDrive\OneDrive.exe" /background',
    '    WSL-Config.Start.Ubuntu-24.04    REG_SZ    "C:\Windows\System32\conhost.exe" --headless ...',
    '    WSL-Config.Start.dev_box    REG_EXPAND_SZ    x',
    '',
  ].join('\r\n');
  assert.deepEqual(parseRunValues(output), ['Ubuntu-24.04', 'dev_box']);
  assert.deepEqual(parseRunValues(''), []);
});

test('the logon command keeps the distro running without a window', () => {
  const command = startCommand('dev-box');
  assert.match(command, /conhost\.exe" --headless "[^"]*wsl\.exe" -d dev-box --exec \/bin\/sh -c "while :; do sleep 3600; done"$/);
});
