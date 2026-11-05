import { Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Settings } from '../types';
import { FormatSelect } from './DistroDialogs';
import { FormError, Note, PathInput } from './Fields';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface SettingsDialogProps {
  settings: Settings;
  onClose: () => void;
  onSaved: () => void;
}

/** Folders for new distros, backups and images (a bigger drive, usually) and the default backup format. */
export function SettingsDialog({ settings, onClose, onSaved }: SettingsDialogProps) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings(draft);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Pastas e preferências"
      description="Onde o app guarda distros novas, backups e imagens. Arquivos que já existem não são movidos."
      className="w-[min(640px,calc(100vw-32px))]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="settings-dialog" variant="primary" disabled={saving}>
            <Save />
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id="settings-dialog" onSubmit={submit} className="space-y-4 px-5 py-4">
        <PathInput label="Novas distros" kind="folder" value={draft.distrosDir} onChange={(value) => set('distrosDir', value)} required hint="Cada distro criada pelo app ganha uma subpasta aqui." />
        <PathInput label="Backups" kind="folder" value={draft.backupsDir} onChange={(value) => set('backupsDir', value)} required />
        <PathInput label="Imagens baixadas e exportadas" kind="folder" value={draft.imagesDir} onChange={(value) => set('imagesDir', value)} required />
        <FormatSelect value={draft.backupFormat} onChange={(value) => set('backupFormat', value)} />
        <Note>O formato vale como padrão dos novos backups; cada backup ainda pode escolher o seu.</Note>
        {error && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
