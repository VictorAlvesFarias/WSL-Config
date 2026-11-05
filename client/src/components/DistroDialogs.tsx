import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, formatLabels } from '../format';
import { exportFormats, type Distro, type ExportFormat, type Settings } from '../types';
import { ConfirmName, FormError, Note, PathInput, UnitInput, Warn } from './Fields';
import { Button } from './ui/Button';
import { Checkbox, FormField, Input, Select } from './ui/Input';
import { Modal } from './ui/Modal';

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

export function useSubmit(action: () => Promise<unknown>, onDone: () => void) {
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

/** Cancel + the dialog's action, submitting the form whose id is given. */
export function DialogFooter({ form, saving, label, danger, onClose, disabled }: { form: string; saving: boolean; label: string; danger?: boolean; onClose: () => void; disabled?: boolean }) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" form={form} variant={danger ? 'danger' : 'primary'} disabled={saving || disabled}>
        {saving ? 'Enviando…' : label}
      </Button>
    </>
  );
}

export function FormatSelect({ value, onChange }: { value: ExportFormat; onChange: (value: ExportFormat) => void }) {
  return (
    <FormField label="Formato">
      <Select value={value} onChange={(e) => onChange(e.target.value as ExportFormat)}>
        {exportFormats.map((format) => (
          <option key={format} value={format}>
            {formatLabels[format]}
          </option>
        ))}
      </Select>
    </FormField>
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
    <div className="space-y-2.5">
      <Warn>Isto mexe no arquivo do disco, que a VM do WSL mantém preso enquanto está ligada, mesmo com a distro parada.</Warn>
      <Checkbox checked={checked} onChange={onChange}>
        Desligar o WSL antes{runningDistros.length ? ` (encerra ${runningDistros.join(', ')})` : ''}
      </Checkbox>
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
      open
      onOpenChange={(open) => !open && onClose()}
      title={action.title}
      footer={<DialogFooter form="distro-dialog" saving={saving} label={action.label} danger={action.danger} onClose={onClose} disabled={blocked} />}
    >
      <form id="distro-dialog" onSubmit={submit} className="space-y-4 px-5 py-4">
        {kind === 'backup' && (
          <>
            <FormatSelect value={format} onChange={setFormat} />
            <FormField label="Observação (opcional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Antes de atualizar o Node…" maxLength={200} />
            </FormField>
            <Note>
              Salvo em <code className="font-mono text-fg">{settings.backupsDir}\{distro.name}</code>.
            </Note>
            {consentBox}
          </>
        )}

        {kind === 'image' && (
          <>
            <FormField label="Nome da imagem">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${distro.name} configurada`} autoFocus maxLength={80} />
            </FormField>
            <FormatSelect value={format} onChange={setFormat} />
            <Note>Uma imagem é um modelo: novas distros podem ser criadas a partir dela na aba Imagens.</Note>
            {consentBox}
          </>
        )}

        {kind === 'duplicate' && (
          <>
            <FormField label="Nome da cópia">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${distro.name}-copia`} autoFocus required />
            </FormField>
            <PathInput label="Pasta (opcional)" kind="folder" value={location} onChange={setLocation} placeholder={`${settings.distrosDir}\\${name || 'nome'}`} />
            <Note>Exporta a distro e importa a cópia com outro nome; o espaço em disco usado dobra.</Note>
          </>
        )}

        {kind === 'move' && (
          <>
            <Note>
              Hoje em <code className="font-mono text-fg">{distro.basePath}</code>
            </Note>
            <PathInput label="Nova pasta" kind="folder" value={location} onChange={setLocation} required placeholder="D:\WSL\..." />
            {consentBox}
          </>
        )}

        {kind === 'resize' && (
          <>
            <FormField label="Tamanho máximo do disco" hint={`O vhdx ocupa hoje ${bytes(distro.vhdSize)} no Windows. Diminuir abaixo do que já está em uso falha.`}>
              <UnitInput unit="GB">
                <Input className="pr-10" type="number" min={1} max={16384} value={sizeGb} onChange={(e) => setSizeGb(Number(e.target.value))} required />
              </UnitInput>
            </FormField>
            {consentBox}
          </>
        )}

        {kind === 'delete' && (
          <>
            <FormError>
              Isto apaga o disco de <strong>{distro.name}</strong> ({bytes(distro.vhdSize)}) com tudo o que há dentro. Os backups e imagens dela continuam.
            </FormError>
            <ConfirmName expected={distro.name} value={confirm} onChange={setConfirm} />
          </>
        )}

        {error && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
