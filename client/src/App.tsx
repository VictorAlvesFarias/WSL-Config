import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { BackupsView } from './components/BackupsView';
import { Icon, type IconName } from './components/Icon';
import { ImagesView } from './components/ImagesView';
import { JobsBar } from './components/JobsBar';
import { MachinesView } from './components/MachinesView';
import { Modal } from './components/Modal';
import { PortsView } from './components/PortsView';
import { ResourcesView } from './components/ResourcesView';
import { SettingsDialog } from './components/SettingsDialog';
import type { AppData, Notice, SystemInfo } from './types';
import { useServerEvents } from './useServerEvents';

type Tab = 'machines' | 'resources' | 'ports' | 'images' | 'backups';

interface Toast {
  id: number;
  kind: 'ok' | 'error';
  message: string;
}

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'machines', label: 'Máquinas', icon: 'layers' },
  { id: 'resources', label: 'Recursos', icon: 'cpu' },
  { id: 'ports', label: 'Portas', icon: 'globe' },
  { id: 'images', label: 'Imagens', icon: 'image' },
  { id: 'backups', label: 'Backups', icon: 'archive' },
];

const tabFromHash = (): Tab => {
  const hash = window.location.hash.slice(1);
  return tabs.some((item) => item.id === hash) ? (hash as Tab) : 'machines';
};

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<'settings' | 'shutdown' | null>(null);

  const loadData = useCallback(() => {
    api.data().then(setData, () => undefined);
  }, []);

  const notify = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 5000);
  }, []);

  const onNotice = useCallback((notice: Notice) => notify(notice.kind, notice.message), [notify]);
  const { state, log, connected } = useServerEvents(loadData, onNotice);

  useEffect(() => {
    loadData();
    api.system().then(setSystem, () => undefined);
  }, [loadData]);

  const setTab = (next: Tab) => {
    setTabState(next);
    window.history.replaceState(null, '', `#${next}`);
  };

  async function shutdown() {
    try {
      await api.shutdown();
      setDialog(null);
    } catch (error) {
      notify('error', (error as Error).message);
    }
  }

  const running = state?.distros.filter((distro) => distro.running) ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="layers" size={22} />
          </span>
          <div>
            <h1>WSL-Config</h1>
            <p className="muted">
              {state ? `${state.distros.length} distro(s) · ${running.length} rodando` : 'Gerenciador das distros do WSL'}
              {system?.wsl.version && ` · WSL ${system.wsl.version}`}
            </p>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
          <button title="Pastas e preferências" onClick={() => setDialog('settings')} disabled={!data}>
            <Icon name="settings" size={15} />
          </button>
        </nav>
      </header>

      {!connected && <div className="banner error">Sem conexão com o servidor interno. Tentando de novo…</div>}
      {system && !system.wsl.installed && (
        <div className="banner error">
          <Icon name="alert" />
          <span>
            O WSL não respondeu neste PC. Instale com <code>wsl --install</code> num terminal de administrador e reinicie.
          </span>
        </div>
      )}
      {state && !state.reachable && state.checkedAt && system?.wsl.installed && (
        <div className="banner warn">
          <Icon name="alert" />
          <span>O WSL não respondeu à última consulta. Se persistir, reinicie o WSL.</span>
        </div>
      )}

      {state && <JobsBar jobs={state.jobs} />}

      <main>
        {data && state && tab === 'machines' && <MachinesView data={data} state={state} log={log} onNotify={notify} />}
        {state && tab === 'resources' && <ResourcesView state={state} log={log} onShutdown={() => setDialog('shutdown')} onNotify={notify} />}
        {state && tab === 'ports' && <PortsView state={state} onNotify={notify} />}
        {data && tab === 'images' && <ImagesView data={data} log={log} onNotify={notify} />}
        {data && state && tab === 'backups' && <BackupsView data={data} state={state} log={log} onNotify={notify} />}
      </main>

      {dialog === 'settings' && data && (
        <SettingsDialog
          settings={data.settings}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            notify('ok', 'Preferências salvas');
            loadData();
          }}
        />
      )}

      {dialog === 'shutdown' && (
        <Modal
          title="Reiniciar o WSL"
          onClose={() => setDialog(null)}
          footer={
            <>
              <span className="spacer" />
              <button className="button ghost" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button className="button warn" onClick={shutdown} disabled={Boolean(state?.jobs.length)}>
                <Icon name="refresh" />
                Desligar agora
              </button>
            </>
          }
        >
          <p>
            Desliga a VM do WSL (<code>wsl --shutdown</code>) para aplicar o .wslconfig. As distros sobem de novo, com a configuração nova, na próxima vez
            que forem usadas.
          </p>
          {running.length > 0 && (
            <p className="form-error">
              Vão ser encerradas: {running.map((distro) => distro.name).join(', ')}. Programas abertos nelas (e uma VPN do WSL-Vpn conectada) caem.
            </p>
          )}
          {Boolean(state?.jobs.length) && <p className="hint warn-text small">Espere as tarefas em andamento terminarem.</p>}
        </Modal>
      )}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
