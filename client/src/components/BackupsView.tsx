import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, dateTime, formatLabels } from '../format';
import { exportFormats, type AppData, type BackupEntry, type ExportFormat, type LogEntry, type PanelState } from '../types';
import { ShutdownConsent } from './DistroDialogs';
import { ConfirmName, PathInput } from './Fields';
import { Icon } from './Icon';
import { LogView } from './LogView';
import { Modal } from './Modal';

interface BackupsViewProps {
  data: AppData;
  state: PanelState;
  log: LogEntry[];
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

type Dialog = { kind: 'create' } | { kind: 'restore'; backup: BackupEntry } | { kind: 'delete'; backup: BackupEntry };

/** Exports of the distros, grouped by distro, that can be restored as a new one or over the original. */
export function BackupsView({ data, state, log, onNotify }: BackupsViewProps) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [distro, setDistro] = useState('');
  const [format, setFormat] = useState<ExportFormat>(data.settings.backupFormat);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = [...new Set(data.backups.map((backup) => backup.distro))].sort();
  const vhdNeedsShutdown = format === 'vhd' && state.vm.running;

  function openDialog(next: Dialog) {
    setDistro(state.distros[0]?.name ?? '');
    setFormat(data.settings.backupFormat);
    setNote('');
    setMode('new');
    setName(next.kind === 'restore' ? `${next.backup.distro}-restaurada` : '');
    setLocation('');
    setConfirm('');
    setConsent(false);
    setError(null);
    setSaving(false);
    setDialog(next);
  }

  async function submit(event: FormEvent, action: () => Promise<unknown>, message: string) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      onNotify('ok', message);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  async function reveal(backup: BackupEntry) {
    try {
      await api.revealBackup(backup.id);
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  const footer = (label: string, { danger = false, disabled = false } = {}) => (
    <>
      <span className="spacer" />
      <button type="button" className="button ghost" onClick={() => setDialog(null)}>
        Cancelar
      </button>
      <button type="submit" className={`button ${danger ? 'danger' : 'primary'}`} disabled={saving || disabled}>
        {saving ? 'Enviando…' : label}
      </button>
    </>
  );

  return (
    <div className="panel-layout">
      <div className="panel-main">
        <header className="section-head">
          <div>
            <h2>Backups</h2>
            <p className="muted small">
              Pasta: <code>{data.settings.backupsDir}</code>
            </p>
          </div>
          <button className="button primary" onClick={() => openDialog({ kind: 'create' })} disabled={!state.distros.length}>
            <Icon name="archive" />
            Fazer backup
          </button>
        </header>

        {groups.length === 0 ? (
          <div className="card empty-state">
            <Icon name="archive" size={32} />
            <h2>Nenhum backup</h2>
            <p className="muted">Um backup exporta a distro inteira para um arquivo. Ele pode virar uma distro nova ou substituir a original.</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group} className="backup-group">
              <h3 className="eyebrow">
                <Icon name="layers" size={13} /> {group}
              </h3>
              <ul className="connection-cards">
                {data.backups
                  .filter((backup) => backup.distro === group)
                  .map((backup) => (
                    <li key={backup.id} className="card connection-card">
                      <div className="connection-card-body static">
                        <Icon name="archive" size={20} />
                        <span className="list-text">
                          <strong>{dateTime(backup.createdAt)}</strong>
                          <span className="muted small">
                            {backup.format} · {bytes(backup.size)}
                            {backup.note && ` · ${backup.note}`}
                          </span>
                        </span>
                        {!backup.exists && <span className="chip chip-warn">arquivo sumiu</span>}
                      </div>
                      <button className="icon-button" title="Mostrar no Explorer" onClick={() => reveal(backup)} disabled={!backup.exists}>
                        <Icon name="folder" />
                      </button>
                      <button className="icon-button danger" title="Apagar" onClick={() => openDialog({ kind: 'delete', backup })}>
                        <Icon name="trash" />
                      </button>
                      <button className="button" onClick={() => openDialog({ kind: 'restore', backup })} disabled={!backup.exists}>
                        <Icon name="restore" />
                        Restaurar
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <LogView entries={log} />

      {dialog?.kind === 'create' && (
        <Modal
          title="Fazer backup"
          onClose={() => setDialog(null)}
          onSubmit={(e) => submit(e, () => api.backup(distro, format, note, vhdNeedsShutdown && consent), 'Backup iniciado')}
          footer={footer('Fazer backup', { disabled: vhdNeedsShutdown && !consent })}
        >
          <label className="field">
            <span>Distro</span>
            <select value={distro} onChange={(e) => setDistro(e.target.value)}>
              {state.distros.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Formato</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {exportFormats.map((item) => (
                <option key={item} value={item}>
                  {formatLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observação (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </label>
          {format === 'vhd' && (
            <ShutdownConsent
              vmRunning={state.vm.running}
              runningDistros={state.distros.filter((item) => item.running).map((item) => item.name)}
              checked={consent}
              onChange={setConsent}
            />
          )}
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}

      {dialog?.kind === 'restore' && (
        <Modal
          title={`Restaurar backup de ${dialog.backup.distro}`}
          onClose={() => setDialog(null)}
          onSubmit={(e) =>
            submit(
              e,
              () => (mode === 'new' ? api.restoreAsNew(dialog.backup.id, name, location) : api.restoreReplacing(dialog.backup.id, confirm)),
              'Restauração iniciada',
            )
          }
          footer={footer(mode === 'new' ? 'Criar distro' : 'Substituir', { danger: mode === 'replace', disabled: mode === 'replace' && confirm !== dialog.backup.distro })}
          wide
        >
          <p className="muted small">
            {dateTime(dialog.backup.createdAt)} · {dialog.backup.format} · {bytes(dialog.backup.size)}
          </p>
          <div className="radio-cards two">
            <label className={`radio-card${mode === 'new' ? ' is-selected' : ''}`}>
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
              <span className="radio-text">
                <strong>Como nova distro</strong>
                <span className="muted small">A original continua como está.</span>
              </span>
            </label>
            <label className={`radio-card${mode === 'replace' ? ' is-selected' : ''}`}>
              <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span className="radio-text">
                <strong>Substituir {dialog.backup.distro}</strong>
                <span className="muted small">Apaga a versão atual e volta para o backup.</span>
              </span>
            </label>
          </div>
          {mode === 'new' ? (
            <>
              <label className="field">
                <span>Nome</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <PathInput label="Pasta (opcional)" kind="folder" value={location} onChange={setLocation} placeholder={`${data.settings.distrosDir}\\${name || 'nome'}`} />
            </>
          ) : (
            <>
              <p className="form-error">
                Tudo o que mudou em {dialog.backup.distro} depois deste backup será perdido. O arquivo do backup continua guardado.
              </p>
              <ConfirmName expected={dialog.backup.distro} value={confirm} onChange={setConfirm} />
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal
          title="Apagar backup"
          onClose={() => setDialog(null)}
          onSubmit={(e) => submit(e, () => api.deleteBackup(dialog.backup.id), 'Backup apagado')}
          footer={footer('Apagar', { danger: true })}
        >
          <p>
            Apagar o backup de <strong>{dialog.backup.distro}</strong> de {dateTime(dialog.backup.createdAt)} ({bytes(dialog.backup.size)})? O arquivo é excluído.
          </p>
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
