import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wslConfigFields } from '../src/configModel.ts';
import { formatOf } from '../src/library.ts';
import { diskSizeGb, distroName, fieldValues, httpsUrl, windowsPath } from '../src/validation.ts';

test('distro names follow the WSL rules', () => {
  assert.equal(distroName('Ubuntu-24.04'), 'Ubuntu-24.04');
  assert.equal(distroName(' dev_box '), 'dev_box');
  assert.throws(() => distroName('my distro'));
  assert.throws(() => distroName('-x'));
  assert.throws(() => distroName('a"b'));
  assert.throws(() => distroName(''));
});

test('paths must be absolute Windows paths', () => {
  assert.equal(windowsPath('D:\\WSL\\dev', 'Pasta'), 'D:\\WSL\\dev');
  assert.equal(windowsPath('\\\\nas\\backups', 'Pasta'), '\\\\nas\\backups');
  assert.equal(windowsPath('', 'Pasta', { required: false }), '');
  assert.throws(() => windowsPath('relative\\dir', 'Pasta'));
  assert.throws(() => windowsPath('/mnt/c', 'Pasta'));
});

test('formats come from the file name', () => {
  assert.equal(formatOf('C:\\images\\alpine-minirootfs.tar.gz'), 'tar.gz');
  assert.equal(formatOf('C:\\x.TGZ'), 'tar.gz');
  assert.equal(formatOf('C:\\x.tar.xz'), 'tar.xz');
  assert.equal(formatOf('C:\\x.tar'), 'tar');
  assert.equal(formatOf('C:\\ext4.vhdx'), 'vhd');
  assert.throws(() => formatOf('C:\\x.zip'));
});

test('form values are checked against their field', () => {
  assert.deepEqual(fieldValues({ memory: 8192, networkingMode: 'NAT', swapFile: '', unknown: 1 }, wslConfigFields), {
    memory: 8192,
    networkingMode: 'NAT',
    swapFile: null,
  });
  assert.throws(() => fieldValues({ memory: 100 }, wslConfigFields));
  assert.throws(() => fieldValues({ memory: '8GB' }, wslConfigFields));
  assert.throws(() => fieldValues({ networkingMode: 'bridged' }, wslConfigFields));
  assert.throws(() => fieldValues({ kernelCommandLine: 'a\nb' }, wslConfigFields));
});

test('disk sizes and URLs', () => {
  assert.equal(diskSizeGb('256GB'), 256);
  assert.equal(diskSizeGb(512), 512);
  assert.throws(() => diskSizeGb(1.5));
  assert.throws(() => httpsUrl('http://example.com/a.tar'));
  assert.equal(httpsUrl('https://example.com/a.tar.gz').hostname, 'example.com');
});
