import { powershell } from './exec.ts';
import { state } from './events.ts';
import { wslExec } from './wsl.ts';

export type Protocol = 'tcp' | 'udp';

/** A listening socket as one distro's ss/netstat reports it. */
export interface RawSocket {
  protocol: Protocol;
  address: string;
  port: number;
  process: string | null;
  pid: number | null;
}

export interface OpenPort extends RawSocket {
  /** Distro whose process owns the socket (null when no running distro could see the process). */
  distro: string | null;
  /** Docker container publishing the port, when there is one. */
  container: string | null;
  /** Answering on localhost in Windows (WSL's wslrelay forwards it). */
  windows: boolean;
}

export interface PortsReport {
  ports: OpenPort[];
  /** The WSL VM address (eth0), reachable from Windows in NAT mode. */
  vmAddress: string | null;
  scanned: string[];
  errors: Array<{ distro: string; message: string }>;
  checkedAt: string;
}

/** "0.0.0.0:22", "[::]:22", "*:22", "127.0.0.53%lo:53", "[fe80::1%eth0]:546" -> address and port. */
export function splitEndpoint(endpoint: string): { address: string; port: number } | null {
  const match = /^(.*):(\d+)$/.exec(endpoint.trim());
  if (!match) return null;
  const address = match[1].replace(/^\[|\]$/g, '').replace(/%[^%\]]*$/, '');
  return { address: address === '*' ? '0.0.0.0' : address, port: Number(match[2]) };
}

/**
 * ss -H -tulpn, e.g.
 *   tcp LISTEN 0 4096 0.0.0.0:8100 0.0.0.0:* users:(("docker-proxy",pid=123,fd=4))
 *   udp UNCONN 0 0 127.0.0.1:323 0.0.0.0:*
 */
export function parseSs(text: string): RawSocket[] {
  const sockets: RawSocket[] = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5 || (fields[0] !== 'tcp' && fields[0] !== 'udp')) continue;
    const local = splitEndpoint(fields[4]);
    if (!local) continue;
    const owner = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
    sockets.push({ protocol: fields[0], ...local, process: owner?.[1] ?? null, pid: owner ? Number(owner[2]) : null });
  }
  return sockets;
}

/**
 * netstat -tulpn (busybox and net-tools), e.g.
 *   tcp   0  0 0.0.0.0:22   0.0.0.0:*   LISTEN   123/sshd
 *   udp   0  0 0.0.0.0:68   0.0.0.0:*            456/udhcpc
 */
export function parseNetstat(text: string): RawSocket[] {
  const sockets: RawSocket[] = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const protocol = fields[0]?.replace(/6$/, '');
    if (protocol !== 'tcp' && protocol !== 'udp') continue;
    if (protocol === 'tcp' && !fields.includes('LISTEN')) continue;
    const local = splitEndpoint(fields[3] ?? '');
    if (!local) continue;
    // PID/Program is the last column, and the program may have spaces ("42/nginx: master pr").
    const ownerIndex = fields.findIndex((field, index) => index > 4 && /^\d+\//.test(field));
    const owner = ownerIndex < 0 ? null : /^(\d+)\/(.*)$/.exec(fields.slice(ownerIndex).join(' '));
    const name = owner?.[2].split(':')[0].trim() || null;
    sockets.push({ protocol, ...local, process: name, pid: owner ? Number(owner[1]) : null });
  }
  return sockets;
}

/** docker ps "Name|0.0.0.0:8100->80/tcp, [::]:8100->80/tcp, 9000/tcp" -> "tcp:8100" -> Name. */
export function parseDockerPorts(text: string): Map<string, string> {
  const published = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const [name, ports] = line.split('|');
    if (!name || !ports) continue;
    for (const match of ports.matchAll(/:(\d+)(?:-(\d+))?->\d+(?:-\d+)?\/(tcp|udp)/g)) {
      const first = Number(match[1]);
      const last = match[2] ? Number(match[2]) : first;
      for (let port = first; port <= last; port++) published.set(`${match[3]}:${port}`, name.trim());
    }
  }
  return published;
}

// Fixed script, as root so ss can name the processes. Missing tools just leave a section empty.
const scanScript = [
  "echo '@@IP'; ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}'",
  "echo '@@SS'; command -v ss >/dev/null 2>&1 && ss -H -tulpn",
  "echo '@@NETSTAT'; command -v ss >/dev/null 2>&1 || netstat -tulpn 2>/dev/null",
  "echo '@@DOCKER'; command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null",
  'exit 0',
].join('; ');

function sections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  let current = '';
  for (const line of text.split(/\r?\n/)) {
    const marker = /^@@(\w+)$/.exec(line);
    if (marker) current = marker[1];
    else if (current) result[current] = (result[current] ?? '') + line + '\n';
  }
  return result;
}

/** TCP ports wslrelay (WSL's localhost forwarding) listens on in Windows. */
async function windowsForwardedPorts(): Promise<Set<number>> {
  const script = `
$relay = @(Get-Process wslrelay -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
if ($relay.Count -gt 0) { Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $relay -contains $_.OwningProcess } | ForEach-Object { $_.LocalPort } }`;
  const result = await powershell(script, { timeoutMs: 30_000 });
  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((port) => Number.isInteger(port) && port > 0),
  );
}

/**
 * Open ports of every running distro. All WSL 2 distros share one network stack, so each one lists
 * every socket, but only the owner's ss can name the process: that is how a port gets its distro.
 * Stopped distros are not started for this.
 */
export async function collectPorts(): Promise<PortsReport> {
  const running = state.distros.filter((distro) => distro.running && distro.ready);
  const errors: PortsReport['errors'] = [];
  let vmAddress: string | null = null;

  const [forwarded, ...scans] = await Promise.all([
    windowsForwardedPorts().catch(() => new Set<number>()),
    ...running.map(async (distro) => {
      try {
        const result = await wslExec(distro.name, ['/bin/sh', '-c', scanScript], { user: 'root', timeoutMs: 30_000 });
        return { distro: distro.name, parts: sections(result.stdout) };
      } catch (error) {
        errors.push({ distro: distro.name, message: (error as Error).message });
        return null;
      }
    }),
  ]);

  const merged = new Map<string, OpenPort>();
  for (const scan of scans) {
    if (!scan) continue;
    vmAddress ??= scan.parts.IP?.trim().split('/')[0] || null;
    const docker = parseDockerPorts(scan.parts.DOCKER ?? '');
    const sockets = [...parseSs(scan.parts.SS ?? ''), ...parseNetstat(scan.parts.NETSTAT ?? '')];
    for (const socket of sockets) {
      const key = `${socket.protocol}|${socket.address}|${socket.port}`;
      const known = merged.get(key);
      const container = docker.get(`${socket.protocol}:${socket.port}`) ?? null;
      // The first listing that names the process (or the container) owns the socket.
      if (!known || (!known.process && socket.process) || (!known.container && container)) {
        merged.set(key, {
          ...socket,
          process: socket.process ?? known?.process ?? null,
          pid: socket.pid ?? known?.pid ?? null,
          distro: socket.process || container ? scan.distro : (known?.distro ?? null),
          container: container ?? known?.container ?? null,
          windows: socket.protocol === 'tcp' && forwarded.has(socket.port),
        });
      }
    }
  }

  return {
    ports: [...merged.values()].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol) || a.address.localeCompare(b.address)),
    vmAddress,
    scanned: running.map((distro) => distro.name),
    errors,
    checkedAt: new Date().toISOString(),
  };
}
