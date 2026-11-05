import { Gauge, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { wslConfigGroups } from '../fields';
import { bytes } from '../format';
import type { LogEntry, PanelState, WslConfig } from '../types';
import { ConfigEditor } from './ConfigEditor';
import { WithLog, type FieldDefinition } from './Fields';
import { Banner, Page } from './Shell';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';

interface ResourcesViewProps {
  state: PanelState;
  log: LogEntry[];
  onShutdown: () => void;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

/** %UserProfile%\.wslconfig: resources and networking of the VM shared by every WSL 2 distro. */
export function ResourcesView({ state, log, onShutdown, onNotify }: ResourcesViewProps) {
  const [config, setConfig] = useState<WslConfig | null>(null);

  const load = useCallback(() => {
    api.wslConfig().then(setConfig, (error: Error) => onNotify('error', error.message));
  }, [onNotify]);

  useEffect(load, [load]);

  async function run(action: () => Promise<WslConfig>) {
    try {
      setConfig(await action());
      onNotify('ok', '.wslconfig salvo. Reinicie o WSL para aplicar.');
    } catch (error) {
      onNotify('error', (error as Error).message);
      throw error;
    }
  }

  // Ceilings from this PC, so the form can't ask for more than exists.
  const adjust = (field: FieldDefinition): FieldDefinition => {
    if (!config) return field;
    if (field.name === 'memory') return { ...field, max: config.host.memoryMb / 1024, help: `O PC tem ${bytes(config.host.memoryMb * 1024 * 1024)}.` };
    if (field.name === 'processors') return { ...field, max: config.host.processors, help: `O PC tem ${config.host.processors} processadores lógicos.` };
    return field;
  };

  const running = state.distros.filter((distro) => distro.running);

  return (
    <WithLog log={log}>
      <Page className="max-w-4xl">
        <Panel className="flex items-center gap-4 px-4 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
            <Gauge className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{state.vm.running ? `${bytes(state.vm.memory)} em uso` : 'VM desligada'}</p>
            <p className="text-[12px] text-fg-muted">
              {state.vm.running ? `${running.length} distro(s) rodando` : 'nenhuma distro rodando'} · <code className="font-mono">{config?.path ?? '%UserProfile%\\.wslconfig'}</code>
              {config && !config.exists && ' · ainda não existe: será criado ao salvar'}
            </p>
          </div>
          <Button onClick={onShutdown} disabled={!state.vm.running}>
            <RotateCcw />
            Reiniciar o WSL
          </Button>
        </Panel>

        {state.pending.vm && (
          <Banner tone="warn">
            <div className="flex items-center gap-3">
              <span className="flex-1">Há mudanças salvas que só valem depois de reiniciar o WSL.</span>
              <Button size="sm" onClick={onShutdown}>
                Reiniciar o WSL
              </Button>
            </div>
          </Banner>
        )}

        {config ? (
          <ConfigEditor
            groups={wslConfigGroups}
            values={config.values}
            text={config.text}
            fileLabel=".wslconfig"
            adjust={adjust}
            onSave={(changes) => run(() => api.saveWslConfig(changes)).then(() => undefined)}
            onSaveText={(text) => run(() => api.saveWslConfigText(text)).then(() => undefined)}
          />
        ) : (
          <p className="py-10 text-center text-[13px] text-fg-muted">Carregando…</p>
        )}
      </Page>
    </WithLog>
  );
}
