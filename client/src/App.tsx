import { Archive, Cpu, FolderCog, Gauge, Image, Layers, LoaderCircle, Network, Play, Power, RotateCcw, Square, SquareTerminal, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { BackupsView } from './components/BackupsView';
import { CommandPalette, type Command } from './components/CommandPalette';
import { DistroDialog, type DistroDialogKind } from './components/DistroDialogs';
import { Warn } from './components/Fields';
import { ImagesView } from './components/ImagesView';
import { distinctJobs, JobsBar, jobPercent } from './components/JobsBar';
import { ActivityBar, type Activity } from './components/layout/ActivityBar';
import { StatusBar, StatusItem, StatusSpacer } from './components/layout/StatusBar';
import { TitleBar, type Menu } from './components/layout/TitleBar';
import { MachinesView } from './components/MachinesView';
import { NewDistroDialog } from './components/NewDistroDialog';
import { PortsView } from './components/PortsView';
import { ResourcesView } from './components/ResourcesView';
import { SettingsDialog } from './components/SettingsDialog';
import { AboutDialog, Banner, Toasts, useShortcuts, useToasts } from './components/Shell';
import { bytes } from './format';
import { Button } from './components/ui/Button';
import { Modal } from './components/ui/Modal';
import { TipProvider } from './components/ui/Tip';
import type { AppData, ImageEntry, Notice, SystemInfo } from './types';
import { useServerEvents } from './useServerEvents';

type Tab = 'machines' | 'resources' | 'ports' | 'images' | 'backups';
type Dialog = { kind: 'settings' } | { kind: 'shutdown' } | { kind: 'new'; image?: ImageEntry } | { kind: 'distro'; action: DistroDialogKind };

const pages: Record<Tab, { label: string; icon: typeof Layers; shortcut: string }> = {
  machines: { label: 'Máquinas', icon: Layers, shortcut: 'Ctrl+1' },
  resources: { label: 'Recursos', icon: Cpu, shortcut: 'Ctrl+2' },
  ports: { label: 'Portas', icon: Network, shortcut: 'Ctrl+3' },
  images: { label: 'Imagens', icon: Image, shortcut: 'Ctrl+4' },
  backups: { label: 'Backups', icon: Archive, shortcut: 'Ctrl+5' },
};
const tabs = Object.keys(pages) as Tab[];

const tabFromHash = (): Tab => {
  const hash = window.location.hash.slice(1);
  return hash in pages ? (hash as Tab) : 'machines';
};

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [openName, setOpenName] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const { toasts, notify } = useToasts();

  const loadData = useCallback(() => {
    api.data().then(setData, () => undefined);
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
  const openDistro = (name: string | null): void => {
    setOpenName(name);
    setTab('machines');
  };

  async function shutdown() {
    try {
      await api.shutdown();
      setDialog(null);
    } catch (error) {
      notify('error', (error as Error).message);
    }
  }

  const run = (action: () => Promise<unknown>, okMessage?: string) =>
    action().then(
      () => okMessage && notify('ok', okMessage),
      (error: Error) => notify('error', error.message),
    );

  const distros = state?.distros ?? [];
  const running = distros.filter((distro) => distro.running);
  const open = distros.find((distro) => distro.name === openName) ?? null;
  const jobs = distinctJobs(state?.jobs ?? []);

  const activities: Activity<Tab>[] = tabs.map((id) => ({
    id,
    ...pages[id],
    count: id === 'machines' ? running.length : id === 'backups' ? 0 : undefined,
    alert: id === 'resources' && Boolean(state?.pending.vm),
  }));

  const menus: Menu[] = [
    {
      label: 'Arquivo',
      items: [
        { label: 'Nova distro', shortcut: 'Ctrl+N', keywords: 'criar instalar importar', onSelect: () => setDialog({ kind: 'new' }) },
        { label: 'Pastas e preferências', shortcut: 'Ctrl+,', keywords: 'configurações backup formato', disabled: !data, onSelect: () => setDialog({ kind: 'settings' }) },
      ],
    },
    {
      label: 'WSL',
      items: [
        { label: 'Reiniciar o WSL', keywords: 'shutdown desligar vm wslconfig', disabled: !state?.vm.running, onSelect: () => setDialog({ kind: 'shutdown' }) },
        { label: 'Recursos (.wslconfig)', keywords: 'memória processadores swap rede', onSelect: () => setTab('resources') },
      ],
    },
    {
      label: 'Exibir',
      items: [
        ...tabs.map((id) => ({ label: pages[id].label, shortcut: pages[id].shortcut, onSelect: () => (id === 'machines' ? openDistro(null) : setTab(id)) })),
        null,
        { label: 'Paleta de comandos', shortcut: 'Ctrl+Shift+P', keywords: 'buscar', onSelect: () => setPaletteOpen(true) },
      ],
    },
    { label: 'Ajuda', items: [{ label: 'Sobre o WSL-Config', keywords: 'versão', onSelect: () => setAboutOpen(true) }] },
  ];

  const commands: Command[] = useMemo(
    () => [
      ...menus.flatMap((menu) =>
        menu.items
          .filter((item) => item !== null)
          .map((item) => ({
            id: `${menu.label}/${item.label}`,
            category: menu.label,
            label: item.label,
            shortcut: item.shortcut,
            keywords: item.keywords,
            disabled: item.disabled,
            run: item.onSelect,
          })),
      ),
      ...distros.flatMap((distro): Command[] => [
        { id: `open/${distro.name}`, category: 'Distro', label: `Abrir ${distro.name}`, detail: distro.running ? 'rodando' : 'parada', icon: <Layers />, run: () => openDistro(distro.name) },
        distro.running
          ? { id: `stop/${distro.name}`, category: 'Distro', label: `Parar ${distro.name}`, icon: <Square />, run: () => void run(() => api.stop(distro.name)) }
          : { id: `start/${distro.name}`, category: 'Distro', label: `Iniciar ${distro.name}`, icon: <Play />, run: () => void run(() => api.start(distro.name)) },
        { id: `terminal/${distro.name}`, category: 'Distro', label: `Terminal de ${distro.name}`, icon: <SquareTerminal />, run: () => void run(() => api.terminal(distro.name)) },
        {
          id: `autostart/${distro.name}`,
          category: 'Distro',
          label: `${distro.autostart ? 'Não iniciar' : 'Iniciar'} ${distro.name} com o Windows`,
          keywords: 'logon boot ligar automaticamente',
          icon: <Power />,
          run: () =>
            void run(
              () => api.setAutostart(distro.name, !distro.autostart),
              distro.autostart ? `${distro.name} não inicia mais com o Windows` : `${distro.name} vai iniciar com o Windows`,
            ),
        },
      ]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, data],
  );

  useShortcuts({
    'ctrl+shift+p': () => setPaletteOpen(true),
    'ctrl+p': () => setPaletteOpen(true),
    f1: () => setPaletteOpen(true),
    ...Object.fromEntries(tabs.map((id, index) => [`ctrl+${index + 1}`, () => (id === 'machines' ? openDistro(null) : setTab(id))])),
    'ctrl+n': () => setDialog({ kind: 'new' }),
    'ctrl+,': () => data && setDialog({ kind: 'settings' }),
  });

  const started = (message: string) => {
    if (dialog?.kind === 'distro' && dialog.action === 'delete') setOpenName(null);
    setDialog(null);
    notify('ok', message);
  };
  const close = () => setDialog(null);
  const statusTone = !connected || (system && !system.wsl.installed) ? 'danger' : state && !state.reachable && state.checkedAt ? 'warn' : 'accent';

  return (
    <TipProvider delayDuration={350}>
      <div className="flex h-full flex-col overflow-hidden">
        <TitleBar
          icon={<Layers strokeWidth={2.4} />}
          title={`${tab === 'machines' && open ? open.name : pages[tab].label} — WSL-Config`}
          menus={menus}
          searchHint="Buscar comandos e distros"
          onCommandPalette={() => setPaletteOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          <ActivityBar
            current={tab}
            items={activities}
            bottom={[{ id: 'settings' as Tab, label: 'Pastas e preferências', icon: FolderCog, shortcut: 'Ctrl+,' }]}
            onNavigate={(id) => ((id as string) === 'settings' ? data && setDialog({ kind: 'settings' }) : id === 'machines' ? openDistro(null) : setTab(id))}
          />

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {(!connected || (system && !system.wsl.installed) || (state && !state.reachable && state.checkedAt && system?.wsl.installed)) && (
              <div className="space-y-2 px-5 pt-5">
                {!connected && <Banner>Sem conexão com o servidor interno. Tentando de novo…</Banner>}
                {system && !system.wsl.installed && (
                  <Banner>
                    O WSL não respondeu neste PC. Instale com <code className="font-mono">wsl --install</code> num terminal de administrador e reinicie.
                  </Banner>
                )}
                {state && !state.reachable && state.checkedAt && system?.wsl.installed && (
                  <Banner tone="warn">O WSL não respondeu à última consulta. Se persistir, reinicie o WSL.</Banner>
                )}
              </div>
            )}
            {state && <JobsBar jobs={state.jobs} />}
            <div className="min-h-0 flex-1 overflow-auto">
              {!state && <p className="py-16 text-center text-[13px] text-fg-muted">Consultando o WSL…</p>}
              {data && state && tab === 'machines' && (
                <MachinesView
                  data={data}
                  state={state}
                  log={log}
                  openName={openName}
                  onOpen={setOpenName}
                  onDialog={(kind) => setDialog(kind === 'new' ? { kind: 'new' } : { kind: 'distro', action: kind })}
                  onNotify={notify}
                />
              )}
              {state && tab === 'resources' && <ResourcesView state={state} log={log} onShutdown={() => setDialog({ kind: 'shutdown' })} onNotify={notify} />}
              {state && tab === 'ports' && <PortsView state={state} onNotify={notify} />}
              {data && tab === 'images' && <ImagesView data={data} log={log} onCreate={(image) => setDialog({ kind: 'new', image })} onNotify={notify} />}
              {data && state && tab === 'backups' && <BackupsView data={data} state={state} log={log} onNotify={notify} />}
            </div>
          </main>
        </div>

        <StatusBar tone={statusTone}>
          {!connected ? (
            <StatusItem tip="O servidor interno não respondeu">
              <Unplug />
              Sem conexão com o servidor interno
            </StatusItem>
          ) : (
            <>
              <StatusItem tip="Distros registradas e quantas estão rodando" onClick={() => openDistro(null)}>
                <Layers />
                {state ? `${distros.length} distro(s) · ${running.length} rodando` : 'Consultando…'}
              </StatusItem>
              <StatusItem tip="A VM do WSL 2, compartilhada por todas as distros" onClick={() => setTab('resources')} className="max-sm:hidden">
                <Gauge />
                {state?.vm.running ? `VM: ${bytes(state.vm.memory)}` : 'VM desligada'}
              </StatusItem>
              {state?.pending.vm && (
                <StatusItem tip="O .wslconfig mudou: reinicie o WSL para aplicar" onClick={() => setDialog({ kind: 'shutdown' })} className="bg-warn text-black hover:bg-warn">
                  <RotateCcw />
                  Reiniciar o WSL
                </StatusItem>
              )}
              {jobs.length > 0 && (
                <StatusItem tip={jobs.map((job) => job.label).join('\n')}>
                  <LoaderCircle className="animate-spin" />
                  {jobs.length === 1 ? `${jobs[0].label}${jobPercent(jobs[0]) !== null ? ` · ${jobPercent(jobs[0])}%` : ''}` : `${jobs.length} tarefas`}
                </StatusItem>
              )}
              <StatusSpacer />
              {distros.some((distro) => distro.autostart) && (
                <StatusItem tip="Distros que iniciam com o Windows" onClick={() => openDistro(null)} className="max-md:hidden">
                  <Power />
                  {distros
                    .filter((distro) => distro.autostart)
                    .map((distro) => distro.name)
                    .join(', ')}
                </StatusItem>
              )}
              {system?.wsl.version && (
                <StatusItem tip={system.wsl.details.join('\n') || 'Versão do WSL'} className="max-sm:hidden">
                  WSL {system.wsl.version}
                </StatusItem>
              )}
            </>
          )}
        </StatusBar>
      </div>

      {dialog?.kind === 'settings' && data && (
        <SettingsDialog
          settings={data.settings}
          onClose={close}
          onSaved={() => {
            close();
            notify('ok', 'Preferências salvas');
            loadData();
          }}
        />
      )}
      {dialog?.kind === 'new' && data && <NewDistroDialog settings={data.settings} images={data.images} initialImage={dialog.image} onClose={close} onStarted={started} />}
      {dialog?.kind === 'distro' && open && data && state && (
        <DistroDialog
          kind={dialog.action}
          distro={open}
          settings={data.settings}
          vmRunning={state.vm.running}
          runningDistros={running.map((distro) => distro.name)}
          onClose={close}
          onStarted={started}
        />
      )}
      {dialog?.kind === 'shutdown' && (
        <Modal
          open
          onOpenChange={(value) => !value && close()}
          title="Reiniciar o WSL"
          description="Desliga a VM do WSL (wsl --shutdown) para aplicar o .wslconfig. As distros sobem de novo, com a configuração nova, na próxima vez que forem usadas."
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => void shutdown()} disabled={Boolean(state?.jobs.length)}>
                <RotateCcw />
                Desligar agora
              </Button>
            </>
          }
        >
          <div className="space-y-3 px-5 py-4">
            {running.length > 0 ? (
              <Warn>
                Vão ser encerradas: {running.map((distro) => distro.name).join(', ')}. Programas abertos nelas (e uma VPN do WSL-Vpn conectada) caem.
              </Warn>
            ) : (
              <p className="text-[13px] text-fg-muted">Nenhuma distro está rodando agora.</p>
            )}
            {Boolean(state?.jobs.length) && <Warn>Espere as tarefas em andamento terminarem.</Warn>}
          </div>
        </Modal>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} name="WSL-Config" icon={<Layers strokeWidth={2.4} />}>
        <p>Gerencia as distros do WSL deste PC: iniciar e parar, recursos da VM, wsl.conf de cada distro, imagens, backups e portas abertas.</p>
        {system?.dataDir && (
          <p className="text-[12px] text-fg-subtle">
            Dados em <code className="font-mono">{system.dataDir}</code>
          </p>
        )}
      </AboutDialog>
      <Toasts toasts={toasts} />
    </TipProvider>
  );
}
