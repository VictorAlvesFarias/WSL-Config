import { Archive, Globe, Image, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api';
import { bytes, suggestName } from '../format';
import type { ImageEntry, OnlineDistro, Settings } from '../types';
import { FormError, Note, PathInput } from './Fields';
import { Button } from './ui/Button';
import { FormField, Input, Select } from './ui/Input';
import { Modal } from './ui/Modal';
import { Segmented } from './ui/Segmented';

type Source = 'online' | 'image' | 'file';

interface NewDistroDialogProps {
  settings: Settings;
  images: ImageEntry[];
  /** Preselects an image (from the Images tab). */
  initialImage?: ImageEntry;
  onClose: () => void;
  onStarted: (message: string) => void;
}

const sourceLabel = (icon: React.ReactNode, text: string) => (
  <span className="flex items-center justify-center gap-1.5 [&_svg]:size-3.5">
    {icon}
    {text}
  </span>
);

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

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Nova distro"
      description="Da loja online, de uma imagem da biblioteca ou de qualquer arquivo."
      className="w-[min(600px,calc(100vw-32px))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-distro" variant="primary" disabled={saving || !name || (source === 'image' && !imageId) || (source === 'file' && !file)}>
            <Plus />
            {saving ? 'Enviando…' : 'Criar'}
          </Button>
        </>
      }
    >
      <form id="new-distro" onSubmit={submit} className="space-y-4 px-5 py-4">
        <Segmented
          label="Origem"
          value={source}
          onChange={setSource}
          options={[
            { value: 'online', label: sourceLabel(<Globe />, 'Loja online') },
            { value: 'image', label: sourceLabel(<Image />, 'Imagem') },
            { value: 'file', label: sourceLabel(<Archive />, 'Arquivo') },
          ]}
        />

        {source === 'online' && (
          <FormField label="Distribuição" hint="Baixada direto da internet. Ao abrir o terminal pela primeira vez, ela pede o usuário e a senha.">
            {online ? (
              <Select value={distro} onChange={(e) => setDistro(e.target.value)}>
                {online.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.friendlyName}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={onlineError ?? 'Buscando a lista…'} disabled />
            )}
          </FormField>
        )}

        {source === 'image' &&
          (available.length ? (
            <FormField label="Imagem da biblioteca">
              <Select value={imageId} onChange={(e) => setImageId(e.target.value)}>
                {available.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name} · {image.format} · {bytes(image.size)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : (
            <Note>A biblioteca está vazia. Adicione imagens na aba Imagens, ou use a opção Arquivo.</Note>
          ))}

        {source === 'file' && (
          <PathInput
            label="Arquivo (.tar, .tar.gz, .tar.xz ou .vhdx)"
            kind="image"
            value={file}
            onChange={setFile}
            required
            hint="Um rootfs exportado (wsl --export, Docker export, rootfs oficial da distro) ou o disco de outra distro."
          />
        )}

        <FormField label="Nome">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            placeholder="dev-box"
            required
          />
        </FormField>
        <PathInput
          label="Pasta (opcional)"
          kind="folder"
          value={location}
          onChange={setLocation}
          placeholder={`${settings.distrosDir}\\${name || 'nome'}`}
          hint="Onde o disco virtual (ext4.vhdx) vai ficar."
        />

        {error && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
