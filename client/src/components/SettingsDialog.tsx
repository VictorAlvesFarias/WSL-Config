import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatLabels } from '../format';
import { exportFormats, type ExportFormat, type Settings } from '../types';
import { PathInput } from './Fields';
import { Icon } from './Icon';
import { Modal } from './Modal';

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
      title="Pastas e preferências"
      onClose={onClose}
      onSubmit={submit}
      wide
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="button ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Icon name="save" />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <PathInput label="Novas distros" kind="folder" value={draft.distrosDir} onChange={(value) => set('distrosDir', value)} required hint="Cada distro criada pelo app ganha uma subpasta aqui." />
      <PathInput label="Backups" kind="folder" value={draft.backupsDir} onChange={(value) => set('backupsDir', value)} required />
      <PathInput label="Imagens baixadas e exportadas" kind="folder" value={draft.imagesDir} onChange={(value) => set('imagesDir', value)} required />
      <label className="field">
        <span>Formato padrão dos backups</span>
        <select value={draft.backupFormat} onChange={(e) => set('backupFormat', e.target.value as ExportFormat)}>
          {exportFormats.map((format) => (
            <option key={format} value={format}>
              {formatLabels[format]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Arquivos que já existem não são movidos.</p>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
