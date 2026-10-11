import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { OpenPort, PanelState, PortsReport } from '../types';
import { Icon } from './Icon';

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
  const visible = (report?.ports ?? []).filter(
    (port) => (protocol === 'all' || port.protocol === protocol) && (!windowsOnly || port.windows) && matches(port, term),
  );
  const stopped = state.distros.filter((distro) => !distro.running).map((distro) => distro.name);

  return (
    <div className="ports">
      <header className="section-head">
        <div>
          <h2>Portas abertas</h2>
          <p className="muted small">
            {report ? `${report.ports.length} porta(s) em ${report.scanned.length} distro(s) rodando` : 'Consultando…'}
            {report?.vmAddress && (
              <>
                {' · IP da VM: '}
                <code>{report.vmAddress}</code>
              </>
            )}
          </p>
        </div>
        <div className="action-row">
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Atualizar sozinho
          </label>
          <button className="button" onClick={() => void load()} disabled={loading}>
            <Icon name="refresh" />
            {loading ? 'Consultando…' : 'Atualizar'}
          </button>
        </div>
      </header>

      <div className="ports-filters card">
        <input className="ports-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por porta, processo, container ou distro" />
        <div className="segmented">
          {(['tcp', 'udp', 'all'] as const).map((value) => (
            <button key={value} className={protocol === value ? 'is-active' : ''} onClick={() => setProtocol(value)}>
              {value === 'all' ? 'Todas' : value.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={windowsOnly} onChange={(e) => setWindowsOnly(e.target.checked)} />
          Só as acessíveis pelo Windows
        </label>
      </div>

      {report?.errors.map((error) => (
        <div key={error.distro} className="banner warn">
          <Icon name="alert" />
          <span>
            {error.distro}: {error.message}
          </span>
        </div>
      ))}

      {report && visible.length === 0 ? (
        <div className="card empty-state">
          <Icon name="link" size={28} />
          <p className="muted">{report.ports.length ? 'Nenhuma porta com esses filtros.' : 'Nenhuma porta aberta nas distros que estão rodando.'}</p>
        </div>
      ) : (
        <div className="card ports-table-card">
          <table className="ports-table">
            <thead>
              <tr>
                <th>Porta</th>
                <th>Endereço</th>
                <th>Processo</th>
                <th>Origem</th>
                <th>Windows</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((port) => (
                <tr key={`${port.protocol}|${port.address}|${port.port}`}>
                  <td>
                    <strong className="mono">{port.port}</strong> <span className="chip">{port.protocol.toUpperCase()}</span>
                  </td>
                  <td>
                    <span className="mono small">{port.address}</span>
                    <span className="muted small block">{scope(port.address)}</span>
                  </td>
                  <td>
                    {port.process ? (
                      <>
                        <span className="mono">{port.process}</span>
                        {port.pid !== null && <span className="muted small"> · PID {port.pid}</span>}
                      </>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <td>
                    {port.container && (
                      <span className="chip chip-accent" title="Container Docker">
                        <Icon name="archive" size={11} /> {port.container}
                      </span>
                    )}
                    {port.distro ? <span className="small"> {port.distro}</span> : !port.container && <span className="muted small">—</span>}
                  </td>
                  <td>
                    {port.windows ? (
                      port.protocol === 'tcp' ? (
                        <a className="link-button small" href={`http://localhost:${port.port}`} target="_blank" rel="noreferrer" title="Abrir no navegador">
                          localhost:{port.port}
                        </a>
                      ) : (
                        <span className="chip chip-ok">sim</span>
                      )
                    ) : (
                      <span className="muted small">{port.protocol === 'udp' && !isLoopback(port.address) ? 'só pelo IP da VM' : 'não'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted small">
        Todas as distros WSL 2 compartilham a rede da VM: a origem é a distro cujo processo abriu a porta. Portas abertas por distros paradas não existem
        {stopped.length ? ` (paradas agora: ${stopped.join(', ')})` : ''}. "Windows" indica as portas que o WSL repassa para o localhost do Windows.
      </p>
    </div>
  );
}
