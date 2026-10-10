import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, dateTime } from '../format';
import type { AppData, ImageEntry, LogEntry } from '../types';
import { PathInput } from './Fields';
import { Icon } from './Icon';
import { LogView } from './LogView';
import { Modal } from './Modal';
import { NewDistroDialog } from './NewDistroDialog';

interface ImagesViewProps {
  data: AppData;
  log: LogEntry[];
  onNotify: (kind: 'ok' | 'error', message: string) => void;
}

type Dialog = { kind: 'add' } | { kind: 'download' } | { kind: 'create'; image: ImageEntry } | { kind: 'delete'; image: ImageEntry };

const sourceLabels: Record<ImageEntry['source'], string> = { file: 'Arquivo', download: 'Download', export: 'Exportada' };

/** Root filesystems and disks that new distros are created from. */
export function ImagesView({ data, log, onNotify }: ImagesViewProps) {
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

  async function reveal(image: ImageEntry) {
    try {
      await api.revealImage(image.id);
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  const footer = (label: string, danger = false) => (
    <>
      <span className="spacer" />
      <button type="button" className="button ghost" onClick={() => setDialog(null)}>
        Cancelar
      </button>
      <button type="submit" className={`button ${danger ? 'danger' : 'primary'}`} disabled={saving}>
        {saving ? 'Enviando…' : label}
      </button>
    </>
  );

  return (
    <div className="panel-layout">
      <div className="panel-main">
        <header className="section-head">
          <div>
            <h2>Imagens</h2>
            <p className="muted small">
              Modelos para criar distros: rootfs (.tar, .tar.gz, .tar.xz) ou discos (.vhdx). Pasta: <code>{data.settings.imagesDir}</code>
            </p>
          </div>
          <div className="action-row">
            <button className="button" onClick={() => openDialog({ kind: 'download' })}>
              <Icon name="download" />
              Baixar
            </button>
            <button className="button primary" onClick={() => openDialog({ kind: 'add' })}>
              <Icon name="plus" />
              Adicionar arquivo
            </button>
          </div>
        </header>

        {data.images.length === 0 ? (
          <div className="card empty-state">
            <Icon name="image" size={32} />
            <h2>Nenhuma imagem</h2>
            <p className="muted">
              Adicione um arquivo do disco, baixe um rootfs oficial (Alpine, Arch, Fedora...) ou salve uma distro configurada como imagem na tela dela.
            </p>
          </div>
        ) : (
          <ul className="connection-cards">
            {data.images.map((image) => (
              <li key={image.id} className="card connection-card">
                <div className="connection-card-body static">
                  <Icon name="image" size={20} />
                  <span className="list-text">
                    <strong>{image.name}</strong>
                    <span className="muted small">
                      {sourceLabels[image.source]} · {image.format} · {bytes(image.size)} · {dateTime(image.addedAt)}
                    </span>
                    <span className="muted small mono ellipsis" title={image.file}>
                      {image.file}
                    </span>
                  </span>
                  {!image.exists && <span className="chip chip-warn">arquivo sumiu</span>}
                </div>
                <button className="icon-button" title="Mostrar no Explorer" onClick={() => reveal(image)} disabled={!image.exists}>
                  <Icon name="folder" />
                </button>
                <button className="icon-button danger" title="Remover" onClick={() => openDialog({ kind: 'delete', image })}>
                  <Icon name="trash" />
                </button>
                <button className="button primary" onClick={() => setDialog({ kind: 'create', image })} disabled={!image.exists}>
                  <Icon name="plus" />
                  Criar distro
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <LogView entries={log} />

      {dialog?.kind === 'add' && (
        <Modal title="Adicionar imagem" onClose={() => setDialog(null)} onSubmit={(e) => submit(e, () => api.addImage(file, name), 'Imagem adicionada')} footer={footer('Adicionar')}>
          <PathInput label="Arquivo" kind="image" value={file} onChange={setFile} required hint="O arquivo continua onde está; a biblioteca só guarda o caminho." />
          <label className="field">
            <span>Nome (opcional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={file.split('\\').pop() || 'Alpine 3.22'} maxLength={80} />
          </label>
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}

      {dialog?.kind === 'download' && (
        <Modal title="Baixar imagem" onClose={() => setDialog(null)} onSubmit={(e) => submit(e, () => api.downloadImage(url, name), 'Download iniciado')} footer={footer('Baixar')} wide>
          <label className="field">
            <span>URL (https)</span>
            <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://dl-cdn.alpinelinux.org/alpine/.../alpine-minirootfs-x86_64.tar.gz" required autoFocus />
            <small className="muted">O endereço tem que terminar em .tar, .tar.gz, .tar.xz ou .vhdx. Salva em {data.settings.imagesDir}.</small>
          </label>
          <label className="field">
            <span>Nome (opcional)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal
          title={`Remover ${dialog.image.name}`}
          onClose={() => setDialog(null)}
          onSubmit={(e) => submit(e, () => api.deleteImage(dialog.image.id, deleteFile), 'Imagem removida')}
          footer={footer('Remover', true)}
        >
          <p className="muted">Distros já criadas a partir dela não são afetadas.</p>
          <label className="check">
            <input type="checkbox" checked={deleteFile} onChange={(e) => setDeleteFile(e.target.checked)} />
            Apagar também o arquivo ({bytes(dialog.image.size)})
          </label>
          {error && <p className="form-error">{error}</p>}
        </Modal>
      )}

      {dialog?.kind === 'create' && (
        <NewDistroDialog
          settings={data.settings}
          images={data.images}
          initialImage={dialog.image}
          onClose={() => setDialog(null)}
          onStarted={(message) => {
            setDialog(null);
            onNotify('ok', message);
          }}
        />
      )}
    </div>
  );
}
