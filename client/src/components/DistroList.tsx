import { useState } from 'react';
import { api } from '../api';
import { bytes } from '../format';
import type { Distro, PanelState } from '../types';
import { Icon } from './Icon';

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

  return (
    <section className="connection-list">
      <header className="section-head">
        <h2>Máquinas</h2>
        <button className="button primary" onClick={onNew}>
          <Icon name="plus" />
          Nova distro
        </button>
      </header>

      {state.distros.length === 0 ? (
        <div className="card empty-state">
          <Icon name="layers" size={32} />
          <h2>{state.reachable ? 'Nenhuma distro instalada' : 'Consultando o WSL…'}</h2>
          <p className="muted">Instale uma da loja online, ou crie a partir de uma imagem ou backup.</p>
          <button className="button primary" onClick={onNew}>
            <Icon name="plus" />
            Nova distro
          </button>
        </div>
      ) : (
        <ul className="connection-cards">
          {state.distros.map((distro) => {
            const job = jobFor(state, distro);
            const busy = Boolean(job) || acting === distro.name || !distro.ready;
            return (
              <li key={distro.id} className={`card connection-card${distro.running ? ' is-up' : ''}`}>
                <button className="connection-card-body" onClick={() => onOpen(distro)} title="Abrir a distro">
                  <span className={`dot ${job ? 'busy' : distro.running ? 'up' : 'idle'}`} />
                  <span className="list-text">
                    <strong>{distro.name}</strong>
                    <span className="muted small">
                      {job ? job.label : `${distro.running ? 'Rodando' : 'Parada'} · WSL ${distro.version}${distro.vhdSize ? ` · disco ${bytes(distro.vhdSize)}` : ''}`}
                    </span>
                  </span>
                  <span className="connection-tags">
                    {distro.isDefault && (
                      <span className="chip chip-accent">
                        <Icon name="star" size={11} /> Padrão
                      </span>
                    )}
                    {distro.flavor && <span className="chip">{[distro.flavor, distro.osVersion].filter(Boolean).join(' ')}</span>}
                    {state.pending.distros.includes(distro.name) && <span className="chip chip-warn">reiniciar</span>}
                  </span>
                  <Icon name="chevron" />
                </button>
                <button className="icon-button" title="Abrir terminal" onClick={() => act(distro, () => api.terminal(distro.name))} disabled={busy}>
                  <Icon name="terminal" />
                </button>
                {distro.running ? (
                  <button className="button" onClick={() => act(distro, () => api.stop(distro.name))} disabled={busy}>
                    <Icon name="stop" />
                    {acting === distro.name ? 'Parando…' : 'Parar'}
                  </button>
                ) : (
                  <button className="button primary" onClick={() => act(distro, () => api.start(distro.name))} disabled={busy}>
                    <Icon name="play" />
                    {acting === distro.name ? 'Iniciando…' : 'Iniciar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
