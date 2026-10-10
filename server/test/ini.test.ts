import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSize, parseSizeMb, readFields, wslConfFields, wslConfigFields, writeFields } from '../src/configModel.ts';
import { getValue, parseIni, readSections, setValue, toText } from '../src/ini.ts';

// The .wslconfig WSL-Vpn writes: BOM, CRLF, comments and a key in another casing ("NAT").
const vpnConfig =
  '﻿# Isolamento de rede do WSL2\r\n' +
  '# NAO use "mirrored": esse modo compartilha a rede com o host.\r\n' +
  '[wsl2]\r\n' +
  'networkingMode=NAT\r\n' +
  'dnsTunneling=false\r\n' +
  'autoProxy=false\r\n';

test('parse and write back without changes keeps the file byte for byte', () => {
  assert.equal(toText(parseIni(vpnConfig)), vpnConfig);
  assert.equal(toText(parseIni('[boot]\nsystemd=true')), '[boot]\nsystemd=true\n');
  assert.equal(toText(parseIni('')), '');
});

test('getValue ignores the case of sections and keys', () => {
  const doc = parseIni(vpnConfig);
  assert.equal(getValue(doc, 'WSL2', 'networkingmode'), 'NAT');
  assert.equal(getValue(doc, 'wsl2', 'memory'), undefined);
  assert.equal(getValue(parseIni('[network]\ngenerateResolvConf = false'), 'network', 'generateResolvConf'), 'false');
});

test('setValue adds to the existing section, keeping comments, BOM and CRLF', () => {
  const text = toText(setValue(parseIni(vpnConfig), 'wsl2', 'memory', '8GB'));
  assert.ok(text.startsWith('﻿# Isolamento'));
  assert.ok(text.includes('autoProxy=false\r\nmemory=8GB\r\n'));
  assert.ok(!/[^\r]\n/.test(text));
});

test('setValue creates a missing section and removes keys', () => {
  let doc = setValue(parseIni(vpnConfig), 'experimental', 'sparseVhd', 'true');
  assert.deepEqual(readSections(doc).experimental, { sparseVhd: 'true' });
  doc = setValue(doc, 'wsl2', 'dnsTunneling', undefined);
  assert.equal(getValue(doc, 'wsl2', 'dnsTunneling'), undefined);
  assert.equal(getValue(doc, 'wsl2', 'networkingMode'), 'NAT');
});

test('setValue keeps the original key casing and quotes', () => {
  const doc = setValue(parseIni('[automount]\nOptions = "metadata"\n'), 'automount', 'options', 'metadata,umask=22');
  assert.equal(toText(doc), '[automount]\nOptions="metadata,umask=22"\n');
});

test('sizes are read in MB and written in the shortest unit', () => {
  assert.equal(parseSizeMb('8GB'), 8192);
  assert.equal(parseSizeMb('4096MB'), 4096);
  assert.equal(parseSizeMb('8 gb'), 8192);
  assert.equal(parseSizeMb('0'), 0);
  assert.equal(parseSizeMb('lots'), null);
  assert.equal(formatSize(8192), '8GB');
  assert.equal(formatSize(1536), '1536MB');
});

test('readFields parses the WSL-Vpn file', () => {
  const values = readFields(parseIni(vpnConfig), wslConfigFields);
  assert.equal(values.networkingMode, 'NAT');
  assert.equal(values.dnsTunneling, false);
  assert.equal(values.memory, null);
});

test('writeFields only rewrites what changed', () => {
  const doc = parseIni(vpnConfig);
  const values = { ...readFields(doc, wslConfigFields), memory: 8192, processors: 4 };
  const text = toText(writeFields(doc, wslConfigFields, values));
  // "NAT" stays as it was written, even though the form sends the same value back.
  assert.ok(text.includes('networkingMode=NAT\r\n'));
  assert.ok(text.includes('memory=8GB\r\nprocessors=4\r\n'));
});

test('writeFields removes a key set back to the WSL default', () => {
  const doc = parseIni('[boot]\nsystemd=true\n\n[user]\ndefault=victor\n');
  const text = toText(writeFields(doc, wslConfFields, { systemd: null, hostname: 'dev-box' }));
  assert.equal(text, '[boot]\n\n[user]\ndefault=victor\n\n[network]\nhostname=dev-box\n');
});
