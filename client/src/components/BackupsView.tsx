import { Archive, ArchiveRestore, FolderOpen, Layers, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, dateTime } from '../format';
import type { AppData, BackupEntry, ExportFormat, LogEntry, PanelState } from '../types';
import { DialogFooter, FormatSelect, ShutdownConsent } from './DistroDialogs';
import { ConfirmName, FormError, Note, PathInput, RadioCards, WithLog } from './Fields';
import { Empty, Page } from './Shell';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { FormField, Input, Select } from './ui/Input';
import { Modal } from './ui/Modal';
import { Panel, PanelHeader } from './ui/Panel';
import { Tip } from './ui/Tip';

interface BackupsViewProps {
  data: AppData;
  state: PanelState;
  log: LogEntry[];
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

export type BackupDialog = { kind: 'create' } | { kind: 'restore'; backup: BackupEntry } | { kind: 'delete'; backup: BackupEntry };

/** Exports of the distros, grouped by distro, that can be restored as a new one or over the original. */
export function BackupsView({ data, state, log, onNotify }: BackupsViewProps) {
  const [dialog, setDialog] = useState<BackupDialog | null>(null);
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

  function openDialog(next: BackupDialog) {
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

  const reveal = (backup: BackupEntry) => api.revealBackup(backup.id).catch((err: Error) => onNotify('error', err.message));
  const close = () => setDialog(null);
  const modalProps = { open: true, onOpenChange: (open: boolean) => !open && close() };

  return (
    <WithLog log={log}>
      <Page>
        <Panel className="overflow-hidden">
          <PanelHeader
            icon={<Archive />}
            title="Backups"
            description={
              <>
                Pasta: <code className="font-mono">{data.settings.backupsDir}</code>
              </>
            }
            actions={
              <Button size="sm" variant="primary" onClick={() => openDialog({ kind: 'create' })} disabled={!state.distros.length}>
                <Archive />
                Fazer backup
              </Button>
            }
          />

          {groups.length === 0 ? (
            <div className="p-4">
              <Empty icon={<Archive />}>
                <p className="text-[14px] font-semibold text-fg">Nenhum backup</p>
                Um backup exporta a distro inteira para um arquivo. Ele pode virar uma distro nova ou substituir a original.
              </Empty>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group}>
                <h3 className="flex items-center gap-1.5 border-b border-line bg-panel-2/60 px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">
                  <Layers className="size-3.5" /> {group}
                </h3>
                <ul className="divide-y divide-line border-b border-line last:border-b-0">
                  {data.backups
                    .filter((backup) => backup.distro === group)
                    .map((backup) => (
                      <li key={backup.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Archive className="size-4.5 shrink-0 text-fg-subtle" strokeWidth={1.6} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-[13px] font-medium">
                            {dateTime(backup.createdAt)}
                            {!backup.exists && <Badge tone="warn">arquivo sumiu</Badge>}
                          </p>
                          <p className="truncate text-[12px] text-fg-muted">
                            {backup.format} · {bytes(backup.size)}
                            {backup.note && ` · ${backup.note}`}
                          </p>
                        </div>
                        <Tip content="Mostrar no Explorer">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => void reveal(backup)} disabled={!backup.exists} aria-label="Mostrar no Explorer">
                            <FolderOpen />
                          </Button>
                        </Tip>
                        <Tip content="Apagar backup">
                          <Button size="icon" variant="ghost" className="size-7 hover:text-danger" onClick={() => openDialog({ kind: 'delete', backup })} aria-label="Apagar">
                            <Trash2 />
                          </Button>
                        </Tip>
                        <Button size="sm" onClick={() => openDialog({ kind: 'restore', backup })} disabled={!backup.exists}>
                          <ArchiveRestore />
                          Restaurar
                        </Button>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </Panel>
      </Page>

      {dialog?.kind === 'create' && (
        <Modal {...modalProps} title="Fazer backup" footer={<DialogFooter form="backup-dialog" saving={saving} label="Fazer backup" onClose={close} disabled={vhdNeedsShutdown && !consent} />}>
          <form id="backup-dialog" onSubmit={(e) => void submit(e, () => api.backup(distro, format, note, vhdNeedsShutdown && consent), 'Backup iniciado')} className="space-y-4 px-5 py-4">
            <FormField label="Distro">
              <Select value={distro} onChange={(e) => setDistro(e.target.value)}>
                {state.distros.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormatSelect value={format} onChange={setFormat} />
            <FormField label="Observação (opcional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </FormField>
            {format === 'vhd' && (
              <ShutdownConsent vmRunning={state.vm.running} runningDistros={state.distros.filter((item) => item.running).map((item) => item.name)} checked={consent} onChange={setConsent} />
            )}
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}

      {dialog?.kind === 'restore' && (
        <Modal
          {...modalProps}
          title={`Restaurar backup de ${dialog.backup.distro}`}
          description={`${dateTime(dialog.backup.createdAt)} · ${dialog.backup.format} · ${bytes(dialog.backup.size)}`}
          className="w-[min(600px,calc(100vw-32px))]"
          footer={
            <DialogFooter
              form="backup-dialog"
              saving={saving}
              label={mode === 'new' ? 'Criar distro' : 'Substituir'}
              danger={mode === 'replace'}
              onClose={close}
              disabled={mode === 'replace' && confirm !== dialog.backup.distro}
            />
          }
        >
          <form
            id="backup-dialog"
            onSubmit={(e) =>
              void submit(e, () => (mode === 'new' ? api.restoreAsNew(dialog.backup.id, name, location) : api.restoreReplacing(dialog.backup.id, confirm)), 'Restauração iniciada')
            }
            className="space-y-4 px-5 py-4"
          >
            <RadioCards
              value={mode}
              onChange={setMode}
              options={[
                { value: 'new', label: 'Como nova distro', hint: 'A original continua como está.' },
                { value: 'replace', label: `Substituir ${dialog.backup.distro}`, hint: 'Apaga a versão atual e volta para o backup.' },
              ]}
            />
            {mode === 'new' ? (
              <>
                <FormField label="Nome">
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </FormField>
                <PathInput label="Pasta (opcional)" kind="folder" value={location} onChange={setLocation} placeholder={`${data.settings.distrosDir}\\${name || 'nome'}`} />
              </>
            ) : (
              <>
                <FormError>Tudo o que mudou em {dialog.backup.distro} depois deste backup será perdido. O arquivo do backup continua guardado.</FormError>
                <ConfirmName expected={dialog.backup.distro} value={confirm} onChange={setConfirm} />
              </>
            )}
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal {...modalProps} title="Apagar backup" footer={<DialogFooter form="backup-dialog" saving={saving} label="Apagar" danger onClose={close} />}>
          <form id="backup-dialog" onSubmit={(e) => void submit(e, () => api.deleteBackup(dialog.backup.id), 'Backup apagado')} className="space-y-4 px-5 py-4">
            <Note>
              Apagar o backup de <strong className="text-fg">{dialog.backup.distro}</strong> de {dateTime(dialog.backup.createdAt)} ({bytes(dialog.backup.size)})? O arquivo é
              excluído.
            </Note>
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}
    </WithLog>
  );
}
