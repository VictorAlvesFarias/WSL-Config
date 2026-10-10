import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { wslConfGroups } from '../fields';
import { bytes, dateTime } from '../format';
import type { AppData, Distro, DistroInside, PanelState } from '../types';
import { ConfigEditor } from './ConfigEditor';
import type { DistroDialogKind } from './DistroDialogs';
import { jobFor } from './DistroList';
import { Icon } from './Icon';

interface DistroPanelProps {
  distro: Distro;
  data: AppData;
  state: PanelState;
  onBack: () => void;
  onDialog: (kind: DistroDialogKind) => void;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

/** Screen 2: one distro. What lives inside it (users, wsl.conf, disk usage) needs it running. */
export function DistroPanel({ distro, data, state, onBack, onDialog, onNotify }: DistroPanelProps) {
  const [inside, setInside] = useState<DistroInside | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [user, setUser] = useState('');
  const job = jobFor(state, distro);
  const busy = Boolean(job) || Boolean(acting);
  const pending = state.pending.distros.includes(distro.name);
  const backups = data.backups.filter((backup) => backup.distro === distro.name).slice(0, 5);

  const load = useCallback(
    async (start: boolean) => {
      setLoading(true);
      try {
        const result = await api.inside(distro.name, start);
        setInside(result);
        setUser(result.users.find((item) => item.uid === distro.defaultUid)?.name ?? '');
      } catch (error) {
        if (start) onNotify('error', (error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [distro.name, distro.defaultUid, onNotify],
  );

  // Reads the inside right away only when that doesn't boot the distro. Keyed on the name alone:
  // the running flag flips on every start/stop and must not reload (or clear) the form.
  useEffect(() => {
    setInside(null);
    if (distro.running) void load(false);
  }, [distro.name]);

  async function act(label: string, action: () => Promise<unknown>, okMessage?: string) {
    setActing(label);
    try {
      await action();
      if (okMessage) onNotify('ok', okMessage);
    } catch (error) {
      onNotify('error', (error as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function restart() {
    await act('restart', async () => {
      await api.stop(distro.name);
      await api.start(distro.name);
      await load(false);
    }, `${distro.name} reiniciada`);
  }

  const used = inside?.disk ? inside.disk.used : null;

  return (
    <div className="connection-screen">
      <section className="card connection-panel">
        <header className="connection-head">
          <button className="icon-button" onClick={onBack} title="Voltar">
            <Icon name="back" />
          </button>
          <div className="connection-title">
            <h2>
              {distro.name} {distro.isDefault && <span className="chip chip-accent">Padrão</span>}
            </h2>
            <span className="muted small">
              {inside?.os || [distro.flavor, distro.osVersion].filter(Boolean).join(' ') || 'Linux'} · WSL {distro.version}
              {inside?.kernel && ` · kernel ${inside.kernel}`}
            </span>
          </div>
          <span className={`chip ${distro.running ? 'chip-ok' : ''}`}>{job ? 'Ocupada' : distro.running ? 'Rodando' : 'Parada'}</span>
        </header>

        {job && (
          <div className="banner warn">
            <Icon name="refresh" />
            <span>{job.label}…</span>
          </div>
        )}

        {pending && (
          <div className="banner warn">
            <Icon name="alert" />
            <span>O wsl.conf mudou: reinicie a distro para aplicar.</span>
            <span className="spacer" />
            <button className="button small" onClick={restart} disabled={busy}>
              {acting === 'restart' ? 'Reiniciando…' : 'Reiniciar distro'}
            </button>
          </div>
        )}

        <div className="action-row">
          {distro.running ? (
            <button className="button" onClick={() => act('stop', () => api.stop(distro.name))} disabled={busy}>
              <Icon name="stop" />
              {acting === 'stop' ? 'Parando…' : 'Parar'}
            </button>
          ) : (
            <button className="button primary" onClick={() => act('start', async () => { await api.start(distro.name); await load(false); })} disabled={busy}>
              <Icon name="play" />
              {acting === 'start' ? 'Iniciando…' : 'Iniciar'}
            </button>
          )}
          <button className="button" onClick={() => act('terminal', () => api.terminal(distro.name))} disabled={busy}>
            <Icon name="terminal" />
            Terminal
          </button>
          <button className="button" onClick={() => act('files', () => api.files(distro.name))} disabled={busy}>
            <Icon name="folder" />
            Arquivos
          </button>
          {!distro.isDefault && (
            <button className="button" onClick={() => act('default', () => api.makeDefault(distro.name), `${distro.name} é a distro padrão`)} disabled={busy}>
              <Icon name="star" />
              Tornar padrão
            </button>
          )}
        </div>
      </section>

      <div className="info-grid">
        <section className="card settings-section">
          <h3>
            <Icon name="disk" /> Disco
          </h3>
          <dl className="facts">
            <dt>No Windows</dt>
            <dd>{distro.vhdPath ? bytes(distro.vhdSize) : 'WSL 1: arquivos soltos'}</dd>
            <dt>Em uso no Linux</dt>
            <dd>{used !== null ? `${bytes(used)} de ${bytes(inside?.disk?.total)}` : '—'}</dd>
            <dt>Pasta</dt>
            <dd className="mono small break">{distro.basePath}</dd>
          </dl>
          <div className="action-row">
            <button className="button small" onClick={() => onDialog('resize')} disabled={busy || distro.version !== 2}>
              Redimensionar
            </button>
            <button className="button small" onClick={() => onDialog('move')} disabled={busy}>
              Mover
            </button>
          </div>
        </section>

        <section className="card settings-section">
          <h3>
            <Icon name="archive" /> Backups
          </h3>
          {backups.length ? (
            <ul className="mini-list">
              {backups.map((backup) => (
                <li key={backup.id}>
                  <span>{dateTime(backup.createdAt)}</span>
                  <span className="muted small">
                    {backup.format} · {bytes(backup.size)}
                    {!backup.exists && ' · arquivo apagado'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nenhum backup ainda.</p>
          )}
          <div className="action-row">
            <button className="button small primary" onClick={() => onDialog('backup')} disabled={busy}>
              <Icon name="archive" />
              Fazer backup
            </button>
            <button className="button small" onClick={() => onDialog('image')} disabled={busy}>
              <Icon name="image" />
              Salvar como imagem
            </button>
            <button className="button small" onClick={() => onDialog('duplicate')} disabled={busy}>
              <Icon name="copy" />
              Duplicar
            </button>
          </div>
        </section>
      </div>

      {inside ? (
        <>
          <section className="card settings-section">
            <h3>
              <Icon name="user" /> Usuário padrão
            </h3>
            <div className="input-row">
              <select className="select" value={user} onChange={(e) => setUser(e.target.value)}>
                {!user && <option value="">—</option>}
                {inside.users.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} (uid {item.uid})
                  </option>
                ))}
              </select>
              <button
                className="button"
                onClick={() => act('user', () => api.setUser(distro.name, user), `Usuário padrão de ${distro.name}: ${user}`)}
                disabled={busy || !user || inside.users.find((item) => item.name === user)?.uid === distro.defaultUid}
              >
                <Icon name="save" />
                Salvar
              </button>
            </div>
            <small className="muted">Usuário que o terminal e o wsl.exe usam ao entrar na distro.</small>
          </section>

          <ConfigEditor
            groups={wslConfGroups}
            values={inside.values}
            text={inside.wslConf}
            fileLabel="/etc/wsl.conf"
            disabled={busy}
            onSave={async (changes) => {
              await api.saveWslConf(distro.name, changes).catch((error: Error) => {
                onNotify('error', error.message);
                throw error;
              });
              onNotify('ok', 'wsl.conf salvo');
              await load(false);
            }}
            onSaveText={async (text) => {
              await api.saveWslConfText(distro.name, text).catch((error: Error) => {
                onNotify('error', error.message);
                throw error;
              });
              onNotify('ok', 'wsl.conf salvo');
              await load(false);
            }}
          />
        </>
      ) : (
        <section className="card settings-section">
          <h3>
            <Icon name="sliders" /> Configuração da distro (wsl.conf) e usuários
          </h3>
          <p className="muted small">
            {distro.running ? 'Carregando…' : 'A distro está parada. Ler a configuração de dentro dela vai iniciá-la.'}
          </p>
          {!distro.running && (
            <button className="button start" onClick={() => load(true)} disabled={loading || busy}>
              <Icon name="play" />
              {loading ? 'Iniciando…' : 'Iniciar e carregar'}
            </button>
          )}
        </section>
      )}

      <section className="card settings-section danger-zone">
        <h3>Zona de perigo</h3>
        <div className="input-row">
          <p className="muted small spacer">Excluir apaga o disco da distro. Faça um backup antes se quiser guardar algo.</p>
          <button className="button danger" onClick={() => onDialog('delete')} disabled={busy}>
            <Icon name="trash" />
            Excluir distro
          </button>
        </div>
      </section>
    </div>
  );
}
