import { Download, FolderOpen, Image, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, dateTime } from '../format';
import type { AppData, ImageEntry, LogEntry } from '../types';
import { DialogFooter } from './DistroDialogs';
import { FormError, Note, PathInput, WithLog } from './Fields';
import { Empty, Page } from './Shell';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Checkbox, FormField, Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Panel, PanelHeader } from './ui/Panel';
import { Tip } from './ui/Tip';

interface ImagesViewProps {
  data: AppData;
  log: LogEntry[];
  /** Opens "Nova distro" with this image chosen. */
  onCreate: (image: ImageEntry) => void;
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

type Dialog = { kind: 'add' } | { kind: 'download' } | { kind: 'delete'; image: ImageEntry };

const sourceLabels: Record<ImageEntry['source'], string> = { file: 'Arquivo', download: 'Download', export: 'Exportada' };

/** Root filesystems and disks that new distros are created from. */
export function ImagesView({ data, log, onCreate, onNotify }: ImagesViewProps) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [file, setFile] = useState('');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [deleteFile, setDeleteFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog(next: Dialog) {
    setFile('');
    setUrl('');
    setName('');
    setDeleteFile(next.kind === 'delete' && next.image.source !== 'file');
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

  const reveal = (image: ImageEntry) => api.revealImage(image.id).catch((err: Error) => onNotify('error', err.message));
  const close = () => setDialog(null);
  const modalProps = { open: true, onOpenChange: (open: boolean) => !open && close() };

  return (
    <WithLog log={log}>
      <Page>
        <Panel className="overflow-hidden">
          <PanelHeader
            icon={<Image />}
            title="Imagens"
            description={
              <>
                Modelos para criar distros: rootfs (.tar, .tar.gz, .tar.xz) ou discos (.vhdx). Pasta: <code className="font-mono">{data.settings.imagesDir}</code>
              </>
            }
            actions={
              <>
                <Button size="sm" onClick={() => openDialog({ kind: 'download' })}>
                  <Download />
                  Baixar
                </Button>
                <Button size="sm" variant="primary" onClick={() => openDialog({ kind: 'add' })}>
                  <Plus />
                  Adicionar arquivo
                </Button>
              </>
            }
          />

          {data.images.length === 0 ? (
            <div className="p-4">
              <Empty icon={<Image />}>
                <p className="text-[14px] font-semibold text-fg">Nenhuma imagem</p>
                Adicione um arquivo do disco, baixe um rootfs oficial (Alpine, Arch, Fedora...) ou salve uma distro configurada como imagem na tela dela.
              </Empty>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.images.map((image) => (
                <li key={image.id} className="flex items-center gap-3 px-4 py-3">
                  <Image className="size-5 shrink-0 text-fg-subtle" strokeWidth={1.6} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                      {image.name}
                      {!image.exists && <Badge tone="warn">arquivo sumiu</Badge>}
                    </p>
                    <p className="truncate text-[12px] text-fg-muted">
                      {sourceLabels[image.source]} · {image.format} · {bytes(image.size)} · {dateTime(image.addedAt)}
                    </p>
                    <p className="selectable truncate font-mono text-[11.5px] text-fg-subtle" title={image.file}>
                      {image.file}
                    </p>
                  </div>
                  <Tip content="Mostrar no Explorer">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => void reveal(image)} disabled={!image.exists} aria-label="Mostrar no Explorer">
                      <FolderOpen />
                    </Button>
                  </Tip>
                  <Tip content="Remover da biblioteca">
                    <Button size="icon" variant="ghost" className="size-7 hover:text-danger" onClick={() => openDialog({ kind: 'delete', image })} aria-label="Remover">
                      <Trash2 />
                    </Button>
                  </Tip>
                  <Button size="sm" variant="primary" onClick={() => onCreate(image)} disabled={!image.exists}>
                    <Plus />
                    Criar distro
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Page>

      {dialog?.kind === 'add' && (
        <Modal {...modalProps} title="Adicionar imagem" footer={<DialogFooter form="image-dialog" saving={saving} label="Adicionar" onClose={close} />}>
          <form id="image-dialog" onSubmit={(e) => void submit(e, () => api.addImage(file, name), 'Imagem adicionada')} className="space-y-4 px-5 py-4">
            <PathInput label="Arquivo" kind="image" value={file} onChange={setFile} required hint="O arquivo continua onde está; a biblioteca só guarda o caminho." />
            <FormField label="Nome (opcional)">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={file.split('\\').pop() || 'Alpine 3.22'} maxLength={80} />
            </FormField>
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}

      {dialog?.kind === 'download' && (
        <Modal
          {...modalProps}
          title="Baixar imagem"
          className="w-[min(640px,calc(100vw-32px))]"
          footer={<DialogFooter form="image-dialog" saving={saving} label="Baixar" onClose={close} />}
        >
          <form id="image-dialog" onSubmit={(e) => void submit(e, () => api.downloadImage(url, name), 'Download iniciado')} className="space-y-4 px-5 py-4">
            <FormField label="URL (https)" hint={`O endereço tem que terminar em .tar, .tar.gz, .tar.xz ou .vhdx. Salva em ${data.settings.imagesDir}.`}>
              <Input className="font-mono text-[12.5px]" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://dl-cdn.alpinelinux.org/alpine/.../alpine-minirootfs-x86_64.tar.gz" required autoFocus />
            </FormField>
            <FormField label="Nome (opcional)">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </FormField>
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal {...modalProps} title={`Remover ${dialog.image.name}`} footer={<DialogFooter form="image-dialog" saving={saving} label="Remover" danger onClose={close} />}>
          <form id="image-dialog" onSubmit={(e) => void submit(e, () => api.deleteImage(dialog.image.id, deleteFile), 'Imagem removida')} className="space-y-4 px-5 py-4">
            <Note>Distros já criadas a partir dela não são afetadas.</Note>
            <Checkbox checked={deleteFile} onChange={setDeleteFile}>
              Apagar também o arquivo ({bytes(dialog.image.size)})
            </Checkbox>
            {error && <FormError>{error}</FormError>}
          </form>
        </Modal>
      )}
    </WithLog>
  );
}
