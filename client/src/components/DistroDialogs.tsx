import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, formatLabels } from '../format';
import { exportFormats, type Distro, type ExportFormat, type Settings } from '../types';
import { ConfirmName, PathInput } from './Fields';
import { Icon } from './Icon';
import { Modal } from './Modal';

export type DistroDialogKind = 'backup' | 'image' | 'duplicate' | 'move' | 'resize' | 'delete';

interface DialogProps {
  kind: DistroDialogKind;
  distro: Distro;
  settings: Settings;
  vmRunning: boolean;
  runningDistros: string[];
  onClose: () => void;
  /** Called after the request was accepted (long jobs report their end as a toast). */
  onStarted: (message: string) => void;
}

function useSubmit(action: () => Promise<unknown>, onDone: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return { saving, error, submit };
}

function Footer({ saving, label, danger, onClose, disabled }: { saving: boolean; label: string; danger?: boolean; onClose: () => void; disabled?: boolean }) {
  return (
    <>
      <span className="spacer" />
      <button type="button" className="button ghost" onClick={onClose}>
        Cancelar
      </button>
      <button type="submit" className={`button ${danger ? 'danger' : 'primary'}`} disabled={saving || disabled}>
        {saving ? 'Enviando…' : label}
      </button>
    </>
  );
}

function FormatSelect({ value, onChange }: { value: ExportFormat; onChange: (value: ExportFormat) => void }) {
  return (
    <label className="field">
      <span>Formato</span>
      <select value={value} onChange={(e) => onChange(e.target.value as ExportFormat)}>
        {exportFormats.map((format) => (
          <option key={format} value={format}>
            {formatLabels[format]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ShutdownConsentProps {
  /** The WSL 2 VM (vmmemWSL) is up. */
  vmRunning: boolean;
  runningDistros: string[];
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Moving, resizing or exporting the disk file needs it detached, and the WSL 2 VM keeps the disk of
 * every distro that ran attached until it shuts down (stopping the distro is not enough).
 */
export function ShutdownConsent({ vmRunning, runningDistros, checked, onChange }: ShutdownConsentProps) {
  if (!vmRunning) return null;
  return (
    <div className="consent">
      <p className="hint warn-text small">
        <Icon name="alert" size={13} /> Isto mexe no arquivo do disco, que a VM do WSL mantém preso enquanto está ligada, mesmo com a distro parada.
      </p>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        Desligar o WSL antes{runningDistros.length ? ` (encerra ${runningDistros.join(', ')})` : ''}
      </label>
    </div>
  );
}

const diskKinds: DistroDialogKind[] = ['move', 'resize'];

export function DistroDialog({ kind, distro, settings, vmRunning, runningDistros, onClose, onStarted }: DialogProps) {
  const [format, setFormat] = useState<ExportFormat>(settings.backupFormat);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [sizeGb, setSizeGb] = useState(distro.vhdSize ? Math.max(1, Math.ceil(distro.vhdSize / 1024 ** 3) * 2) : 256);
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const touchesDisk = diskKinds.includes(kind) || ((kind === 'backup' || kind === 'image') && format === 'vhd');
  const needsShutdown = touchesDisk && vmRunning;
  const shutdownFirst = needsShutdown && consent;

  const actions: Record<DistroDialogKind, { title: string; label: string; run: () => Promise<unknown>; message: string; danger?: boolean }> = {
    backup: { title: `Backup de ${distro.name}`, label: 'Fazer backup', run: () => api.backup(distro.name, format, note, shutdownFirst), message: 'Backup iniciado' },
    image: {
      title: `Salvar ${distro.name} como imagem`,
      label: 'Salvar imagem',
      run: () => api.saveAsImage(distro.name, name, format, shutdownFirst),
      message: 'Exportando a imagem',
    },
    duplicate: { title: `Duplicar ${distro.name}`, label: 'Duplicar', run: () => api.duplicate(distro.name, name, location), message: 'Duplicação iniciada' },
    move: { title: `Mover ${distro.name}`, label: 'Mover', run: () => api.move(distro.name, location, shutdownFirst), message: 'Movendo a distro' },
    resize: { title: `Disco de ${distro.name}`, label: 'Redimensionar', run: () => api.resize(distro.name, sizeGb, shutdownFirst), message: 'Redimensionando o disco' },
    delete: { title: `Excluir ${distro.name}`, label: 'Excluir para sempre', run: () => api.remove(distro.name, confirm), message: 'Excluindo a distro', danger: true },
  };
  const action = actions[kind];
  const { saving, error, submit } = useSubmit(action.run, () => onStarted(action.message));
  const blocked = (kind === 'delete' && confirm !== distro.name) || (needsShutdown && !consent);
  const consentBox = touchesDisk && <ShutdownConsent vmRunning={vmRunning} runningDistros={runningDistros} checked={consent} onChange={setConsent} />;

  return (
    <Modal
      title={action.title}
      onClose={onClose}
      onSubmit={submit}
      footer={<Footer saving={saving} label={action.label} danger={action.danger} onClose={onClose} disabled={blocked} />}
    >
      {kind === 'backup' && (
        <>
          <FormatSelect value={format} onChange={setFormat} />
          <label className="field">
            <span>Observação (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Antes de atualizar o Node…" maxLength={200} />
          </label>
          <p className="muted small">
            Salvo em <code>{settings.backupsDir}\{distro.name}</code>.
          </p>
          {consentBox}
        </>
      )}

      {kind === 'image' && (
        <>
          <label className="field">
            <span>Nome da imagem</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${distro.name} configurada`} autoFocus maxLength={80} />
          </label>
          <FormatSelect value={format} onChange={setFormat} />
          <p className="muted small">Uma imagem é um modelo: novas distros podem ser criadas a partir dela na aba Imagens.</p>
          {consentBox}
        </>
      )}

      {kind === 'duplicate' && (
        <>
          <label className="field">
            <span>Nome da cópia</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${distro.name}-copia`} autoFocus required />
          </label>
          <PathInput label="Pasta (opcional)" kind="folder" value={location} onChange={setLocation} placeholder={`${settings.distrosDir}\\${name || 'nome'}`} />
          <p className="muted small">Exporta a distro e importa a cópia com outro nome; o espaço em disco usado dobra.</p>
        </>
      )}

      {kind === 'move' && (
        <>
          <p className="muted small">
            Hoje em <code>{distro.basePath}</code>
          </p>
          <PathInput label="Nova pasta" kind="folder" value={location} onChange={setLocation} required placeholder="D:\WSL\..." />
          {consentBox}
        </>
      )}

      {kind === 'resize' && (
        <>
          <label className="field">
            <span>Tamanho máximo do disco</span>
            <div className="input-unit">
              <input type="number" min={1} max={16384} value={sizeGb} onChange={(e) => setSizeGb(Number(e.target.value))} required />
              <span>GB</span>
            </div>
            <small className="muted">
              O vhdx ocupa hoje {bytes(distro.vhdSize)} no Windows. Diminuir abaixo do que já está em uso falha.
            </small>
          </label>
          {consentBox}
        </>
      )}

      {kind === 'delete' && (
        <>
          <p className="form-error">
            Isto apaga o disco de <strong>{distro.name}</strong> ({bytes(distro.vhdSize)}) com tudo o que há dentro. Os backups e imagens dela continuam.
          </p>
          <ConfirmName expected={distro.name} value={confirm} onChange={setConfirm} />
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
