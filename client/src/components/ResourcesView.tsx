import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { wslConfigGroups } from '../fields';
import { bytes } from '../format';
import type { LogEntry, PanelState, WslConfig } from '../types';
import { ConfigEditor } from './ConfigEditor';
import type { FieldDefinition } from './Fields';
import { Icon } from './Icon';
import { LogView } from './LogView';

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
    <div className="panel-layout">
      <div className="panel-main">
        <header className="section-head">
          <div>
            <h2>Recursos do WSL</h2>
            <p className="muted small">
              <code>{config?.path ?? '%UserProfile%\\.wslconfig'}</code>
              {config && !config.exists && ' · ainda não existe: será criado ao salvar'}
            </p>
          </div>
          <div className="vm-meter card">
            <Icon name="gauge" />
            <span className="list-text">
              <strong>{state.vm.running ? bytes(state.vm.memory) : 'VM desligada'}</strong>
              <span className="muted small">{state.vm.running ? `em uso · ${running.length} distro(s) rodando` : 'nenhuma distro rodando'}</span>
            </span>
          </div>
        </header>

        {state.pending.vm && (
          <div className="banner warn">
            <Icon name="alert" />
            <span>Há mudanças salvas que só valem depois de reiniciar o WSL.</span>
            <span className="spacer" />
            <button className="button small" onClick={onShutdown}>
              Reiniciar o WSL
            </button>
          </div>
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
            footer={
              <button className="button" onClick={onShutdown} disabled={!state.vm.running}>
                <Icon name="refresh" />
                Reiniciar o WSL
              </button>
            }
          />
        ) : (
          <p className="muted">Carregando…</p>
        )}
      </div>

      <LogView entries={log} />
    </div>
  );
}
