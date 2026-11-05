import { Container, ExternalLink, Network, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { OpenPort, PanelState, PortsReport } from '../types';
import { Banner, Empty, Page } from './Shell';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { cn } from './ui/cn';
import { Checkbox, Input } from './ui/Input';
import { Panel, PanelHeader } from './ui/Panel';
import { Segmented } from './ui/Segmented';

interface PortsViewProps {
  state: PanelState;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

const autoRefreshMs = 5000;

const isLoopback = (address: string) => address.startsWith('127.') || address === '::1' || address === '::ffff:127.0.0.1';

function scope(address: string): string {
  if (address === '0.0.0.0' || address === '::') return 'Todas as interfaces';
  if (isLoopback(address)) return 'Só local';
  return address;
}

const matches = (port: OpenPort, search: string) =>
  !search || [String(port.port), port.process ?? '', port.container ?? '', port.distro ?? '', port.address].some((value) => value.toLowerCase().includes(search));

/** Listening sockets of every running distro, with who owns them and whether Windows reaches them. */
export function PortsView({ state, onNotify }: PortsViewProps) {
  const [report, setReport] = useState<PortsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [search, setSearch] = useState('');
  const [protocol, setProtocol] = useState<'all' | 'tcp' | 'udp'>('tcp');
  const [windowsOnly, setWindowsOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.ports());
    } catch (error) {
      onNotify('error', (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => void load(), autoRefreshMs);
    return () => clearInterval(timer);
  }, [auto, load]);

  const term = search.trim().toLowerCase();
  const visible = (report?.ports ?? []).filter((port) => (protocol === 'all' || port.protocol === protocol) && (!windowsOnly || port.windows) && matches(port, term));
  const stopped = state.distros.filter((distro) => !distro.running).map((distro) => distro.name);

  return (
    <Page>
      <Panel className="overflow-hidden">
        <PanelHeader
          icon={<Network />}
          title="Portas abertas"
          description={
            <>
              {report ? `${report.ports.length} porta(s) em ${report.scanned.length} distro(s) rodando` : 'Consultando…'}
              {report?.vmAddress && (
                <>
                  {' · IP da VM: '}
                  <code className="selectable font-mono text-fg">{report.vmAddress}</code>
                </>
              )}
            </>
          }
          actions={
            <>
              <Checkbox checked={auto} onChange={setAuto} className="text-[12.5px] max-md:hidden">
                Atualizar sozinho
              </Checkbox>
              <Button size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn(loading && 'animate-spin')} />
                Atualizar
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input className="h-7 pl-8 text-[12.5px]" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por porta, processo, container ou distro" />
          </div>
          <Segmented
            label="Protocolo"
            className="w-48"
            value={protocol}
            onChange={setProtocol}
            options={[
              { value: 'tcp', label: 'TCP' },
              { value: 'udp', label: 'UDP' },
              { value: 'all', label: 'Todas' },
            ]}
          />
          <Checkbox checked={windowsOnly} onChange={setWindowsOnly} className="text-[12.5px]">
            Só as acessíveis pelo Windows
          </Checkbox>
        </div>

        {report?.errors.length ? (
          <div className="space-y-2 border-b border-line p-3">
            {report.errors.map((error) => (
              <Banner key={error.distro} tone="warn">
                {error.distro}: {error.message}
              </Banner>
            ))}
          </div>
        ) : null}

        {report && visible.length === 0 ? (
          <div className="p-4">
            <Empty icon={<Network />}>{report.ports.length ? 'Nenhuma porta com esses filtros.' : 'Nenhuma porta aberta nas distros que estão rodando.'}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11.5px] tracking-wide text-fg-subtle uppercase">
                  <th className="px-4 py-2 font-medium">Porta</th>
                  <th className="px-3 py-2 font-medium">Endereço</th>
                  <th className="px-3 py-2 font-medium">Processo</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Windows</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((port) => (
                  <tr key={`${port.protocol}|${port.address}|${port.port}`} className="border-b border-line last:border-b-0 hover:bg-panel-2/50">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <strong className="selectable font-mono text-[13px]">{port.port}</strong> <Badge className="ml-1">{port.protocol.toUpperCase()}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <span className="selectable block font-mono text-[12px]">{port.address}</span>
                      <span className="block text-[11.5px] text-fg-subtle">{scope(port.address)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {port.process ? (
                        <>
                          <span className="font-mono">{port.process}</span>
                          {port.pid !== null && <span className="text-fg-subtle"> · PID {port.pid}</span>}
                        </>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {port.container && (
                          <Badge tone="accent" title="Container Docker">
                            <Container /> {port.container}
                          </Badge>
                        )}
                        {port.distro ? <span>{port.distro}</span> : !port.container && <span className="text-fg-subtle">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {port.windows ? (
                        port.protocol === 'tcp' ? (
                          <a className="inline-flex items-center gap-1 text-accent hover:underline" href={`http://localhost:${port.port}`} target="_blank" rel="noreferrer">
                            localhost:{port.port}
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <Badge tone="ok">sim</Badge>
                        )
                      ) : (
                        <span className="text-fg-subtle">{port.protocol === 'udp' && !isLoopback(port.address) ? 'só pelo IP da VM' : 'não'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-[12px] leading-relaxed text-fg-muted">
        Todas as distros WSL 2 compartilham a rede da VM: a origem é a distro cujo processo abriu a porta. Portas abertas por distros paradas não existem
        {stopped.length ? ` (paradas agora: ${stopped.join(', ')})` : ''}. “Windows” indica as portas que o WSL repassa para o localhost do Windows.
      </p>
    </Page>
  );
}
