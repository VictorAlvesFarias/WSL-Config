import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDockerPorts, parseNetstat, parseSs, splitEndpoint } from '../src/ports.ts';

test('endpoints: IPv4, IPv6, wildcard and interface suffixes', () => {
  assert.deepEqual(splitEndpoint('0.0.0.0:22'), { address: '0.0.0.0', port: 22 });
  assert.deepEqual(splitEndpoint('[::]:8100'), { address: '::', port: 8100 });
  assert.deepEqual(splitEndpoint('*:5432'), { address: '0.0.0.0', port: 5432 });
  assert.deepEqual(splitEndpoint('127.0.0.53%lo:53'), { address: '127.0.0.53', port: 53 });
  assert.deepEqual(splitEndpoint('[fe80::1%eth0]:546'), { address: 'fe80::1', port: 546 });
  assert.deepEqual(splitEndpoint('[::ffff:127.0.0.1]:3000'), { address: '::ffff:127.0.0.1', port: 3000 });
  assert.equal(splitEndpoint('garbage'), null);
});

test('ss -H -tulpn (Ubuntu)', () => {
  const sockets = parseSs(
    [
      'udp UNCONN 0      0      127.0.0.1:323 0.0.0.0:*',
      'tcp LISTEN 0      5      0.0.0.0:18765 0.0.0.0:* users:(("python3",pid=197817,fd=3))',
      'tcp LISTEN 0      4096      [::]:8100    [::]:* users:(("docker-proxy",pid=1234,fd=7))',
      '',
    ].join('\n'),
  );
  assert.deepEqual(sockets, [
    { protocol: 'udp', address: '127.0.0.1', port: 323, process: null, pid: null },
    { protocol: 'tcp', address: '0.0.0.0', port: 18765, process: 'python3', pid: 197817 },
    { protocol: 'tcp', address: '::', port: 8100, process: 'docker-proxy', pid: 1234 },
  ]);
});

test('netstat -tulpn (BusyBox / Alpine)', () => {
  const sockets = parseNetstat(
    [
      'Active Internet connections (only servers)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name',
      'tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      42/nginx: master pr',
      'tcp        0      0 10.0.0.2:5555           10.0.0.9:40000          ESTABLISHED 77/app',
      'tcp6       0      0 :::22                   :::*                    LISTEN      12/sshd',
      'udp        0      0 0.0.0.0:68              0.0.0.0:*                           9/udhcpc',
    ].join('\n'),
  );
  assert.deepEqual(
    sockets.map((socket) => [socket.protocol, socket.address, socket.port, socket.pid, socket.process]),
    [
      ['tcp', '0.0.0.0', 80, 42, 'nginx'],
      ['tcp', '::', 22, 12, 'sshd'],
      ['udp', '0.0.0.0', 68, 9, 'udhcpc'],
    ],
  );
});

test('docker ps ports: published host ports and ranges, not internal ones', () => {
  const published = parseDockerPorts(
    [
      'personal-safeguard-frontend-1|0.0.0.0:8100->80/tcp, [::]:8100->80/tcp',
      'personal-rabbitmq-1|4369/tcp, 0.0.0.0:5672->5672/tcp, 0.0.0.0:15672->15672/tcp',
      'game-server|0.0.0.0:27015-27017->27015-27017/udp',
      'worker|',
    ].join('\n'),
  );
  assert.equal(published.get('tcp:8100'), 'personal-safeguard-frontend-1');
  assert.equal(published.get('tcp:15672'), 'personal-rabbitmq-1');
  assert.equal(published.get('tcp:4369'), undefined);
  assert.equal(published.get('udp:27016'), 'game-server');
  assert.equal(published.size, 6);
});
