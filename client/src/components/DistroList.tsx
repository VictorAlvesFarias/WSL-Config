import { ChevronRight, Layers, Play, Plus, Power, Square, Star, SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { bytes } from '../format';
import type { Distro, PanelState } from '../types';
import { Dot, Empty } from './Shell';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { cn } from './ui/cn';
import { Panel, PanelHeader } from './ui/Panel';
import { Tip } from './ui/Tip';

interface DistroListProps {
  state: PanelState;
  onOpen: (distro: Distro) => void;
  onNew: () => void;
  onError: (message: string) => void;
}

export const jobFor = (state: PanelState, distro: Distro) => state.jobs.find((job) => job.distro === distro.name);

/** Screen 1: every registered distro, with start/stop and a terminal shortcut. */
export function DistroList({ state, onOpen, onNew, onError }: DistroListProps) {
  const [acting, setActing] = useState<string | null>(null);

  async function act(distro: Distro, action: () => Promise<unknown>) {
    setActing(distro.name);
    try {
      await action();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setActing(null);
    }
  }

  if (state.distros.length === 0) {
    return (
      <Empty
        icon={<Layers />}
        action={
          <Button variant="primary" onClick={onNew}>
            <Plus />
            Nova distro
          </Button>
        }
      >
        <p className="text-[14px] font-semibold text-fg">{state.reachable ? 'Nenhuma distro instalada' : 'Consultando o WSL…'}</p>
        Instale uma da loja online, ou crie a partir de uma imagem ou backup.
      </Empty>
    );
  }

  const running = state.distros.filter((distro) => distro.running).length;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Máquinas"
        description={`${state.distros.length} distro(s) · ${running} rodando`}
        actions={
          <Button size="sm" variant="primary" onClick={onNew}>
            <Plus />
            Nova distro
          </Button>
        }
      />
      <ul className="divide-y divide-line">
        {state.distros.map((distro) => {
          const job = jobFor(state, distro);
          const busy = Boolean(job) || acting === distro.name || !distro.ready;
          return (
            <li key={distro.id} className={cn('flex items-center gap-2 pr-4', distro.running && 'bg-ok-soft/30')}>
              <button
                className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left outline-none hover:bg-panel-2/50 focus-visible:bg-panel-2"
                onClick={() => onOpen(distro)}
              >
                <Dot state={job ? 'busy' : distro.running ? 'up' : 'idle'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{distro.name}</span>
                  <span className="block truncate text-[12px] text-fg-muted">
                    {job ? job.label : `${distro.running ? 'Rodando' : 'Parada'} · WSL ${distro.version}${distro.vhdSize ? ` · disco ${bytes(distro.vhdSize)}` : ''}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1.5 max-md:hidden">
                  {distro.isDefault && (
                    <Badge tone="accent">
                      <Star /> Padrão
                    </Badge>
                  )}
                  {distro.autostart && (
                    <Tip content="Inicia com o Windows">
                      <Badge tone="ok">
                        <Power /> Com o Windows
                      </Badge>
                    </Tip>
                  )}
                  {distro.flavor && <Badge>{[distro.flavor, distro.osVersion].filter(Boolean).join(' ')}</Badge>}
                  {state.pending.distros.includes(distro.name) && <Badge tone="warn">reiniciar</Badge>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
              </button>
              <Tip content="Abrir terminal">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => void act(distro, () => api.terminal(distro.name))} disabled={busy} aria-label="Abrir terminal">
                  <SquareTerminal />
                </Button>
              </Tip>
              {distro.running ? (
                <Button size="sm" className="w-24 justify-center" onClick={() => void act(distro, () => api.stop(distro.name))} disabled={busy}>
                  <Square />
                  {acting === distro.name ? 'Parando…' : 'Parar'}
                </Button>
              ) : (
                <Button size="sm" variant="primary" className="w-24 justify-center" onClick={() => void act(distro, () => api.start(distro.name))} disabled={busy}>
                  <Play />
                  {acting === distro.name ? 'Iniciando…' : 'Iniciar'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
