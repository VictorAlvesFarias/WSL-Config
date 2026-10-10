import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, suggestName } from '../format';
import type { ImageEntry, OnlineDistro, Settings } from '../types';
import { PathInput } from './Fields';
import { Icon } from './Icon';
import { Modal } from './Modal';

type Source = 'online' | 'image' | 'file';

interface NewDistroDialogProps {
  settings: Settings;
  images: ImageEntry[];
  /** Preselects an image (from the Images tab). */
  initialImage?: ImageEntry;
  onClose: () => void;
  onStarted: (message: string) => void;
}

/** New distro from the online catalog (wsl --install), a library image or any file (wsl --import). */
export function NewDistroDialog({ settings, images, initialImage, onClose, onStarted }: NewDistroDialogProps) {
  const available = useMemo(() => images.filter((image) => image.exists), [images]);
  const [source, setSource] = useState<Source>(initialImage ? 'image' : 'online');
  const [online, setOnline] = useState<OnlineDistro[] | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [distro, setDistro] = useState('');
  const [imageId, setImageId] = useState(initialImage?.id ?? available[0]?.id ?? '');
  const [file, setFile] = useState('');
  const [name, setName] = useState(initialImage ? suggestName(initialImage.name) : '');
  const [nameTouched, setNameTouched] = useState(Boolean(initialImage));
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (source !== 'online' || online) return;
    api.online().then(
      (list) => {
        setOnline(list);
        const preferred = list.find((item) => item.name === 'Ubuntu') ?? list[0];
        if (preferred) setDistro(preferred.name);
      },
      (err: Error) => setOnlineError(err.message),
    );
  }, [source, online]);

  // Until the user types a name, follow the chosen source.
  useEffect(() => {
    if (nameTouched) return;
    if (source === 'online') setName(suggestName(distro));
    if (source === 'image') setName(suggestName(available.find((image) => image.id === imageId)?.name ?? ''));
    if (source === 'file') setName(suggestName(file.split('\\').pop() ?? ''));
  }, [source, distro, imageId, file, nameTouched, available]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (source === 'online') await api.install({ distro, name, location });
      if (source === 'image') await api.createFromImage(imageId, name, location);
      if (source === 'file') await api.importFile({ name, file, location });
      onStarted(source === 'online' ? `Instalando ${name}: o download aparece no log` : `Criando ${name}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const sources: Array<{ id: Source; label: string; icon: 'globe' | 'image' | 'archive' }> = [
    { id: 'online', label: 'Loja online', icon: 'globe' },
    { id: 'image', label: 'Imagem', icon: 'image' },
    { id: 'file', label: 'Arquivo', icon: 'archive' },
  ];

  return (
    <Modal
      title="Nova distro"
      onClose={onClose}
      onSubmit={submit}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="button ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={saving || !name || (source === 'image' && !imageId) || (source === 'file' && !file)}>
            <Icon name="plus" />
            {saving ? 'Enviando…' : 'Criar'}
          </button>
        </>
      }
    >
      <div className="segmented">
        {sources.map((item) => (
          <button type="button" key={item.id} className={source === item.id ? 'is-active' : ''} onClick={() => setSource(item.id)}>
            <Icon name={item.icon} size={14} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="form-grid">
        {source === 'online' && (
          <label className="field span-2">
            <span>Distribuição</span>
            {online ? (
              <select value={distro} onChange={(e) => setDistro(e.target.value)}>
                {online.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.friendlyName}
                  </option>
                ))}
              </select>
            ) : (
              <input value={onlineError ?? 'Buscando a lista…'} disabled />
            )}
            <small className="muted">Baixada direto da internet. Ao abrir o terminal pela primeira vez, ela pede o usuário e a senha.</small>
          </label>
        )}

        {source === 'image' &&
          (available.length ? (
            <label className="field span-2">
              <span>Imagem da biblioteca</span>
              <select value={imageId} onChange={(e) => setImageId(e.target.value)}>
                {available.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name} · {image.format} · {bytes(image.size)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="span-2 muted">A biblioteca está vazia. Adicione imagens na aba Imagens, ou use a opção Arquivo.</p>
          ))}

        {source === 'file' && (
          <PathInput
            className="span-2"
            label="Arquivo (.tar, .tar.gz, .tar.xz ou .vhdx)"
            kind="image"
            value={file}
            onChange={setFile}
            required
            hint="Um rootfs exportado (wsl --export, Docker export, rootfs oficial da distro) ou o disco de outra distro."
          />
        )}

        <label className="field span-2">
          <span>Nome</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="dev-box"
            required
          />
        </label>
        <PathInput
          className="span-2"
          label="Pasta (opcional)"
          kind="folder"
          value={location}
          onChange={setLocation}
          placeholder={`${settings.distrosDir}\\${name || 'nome'}`}
          hint="Onde o disco virtual (ext4.vhdx) vai ficar."
        />
      </div>

      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
