import { useEffect, useState, type ReactNode } from 'react';
import type { FieldGroup } from '../fields';
import type { FieldValues } from '../types';
import { ConfigField, type FieldDefinition } from './Fields';
import { Icon } from './Icon';

interface ConfigEditorProps {
  groups: FieldGroup[];
  /** Values as saved in the file. */
  values: FieldValues;
  text: string;
  fileLabel: string;
  onSave: (changes: FieldValues) => Promise<void>;
  onSaveText: (text: string) => Promise<void>;
  /** Adjusts a field before rendering (host limits, for instance). */
  adjust?: (field: FieldDefinition) => FieldDefinition;
  footer?: ReactNode;
  disabled?: boolean;
}

/**
 * Form over an INI file, with a raw text mode for keys the form doesn't know. Only changed fields
 * are sent, and the server rewrites only those keys.
 */
export function ConfigEditor({ groups, values, text, fileLabel, onSave, onSaveText, adjust, footer, disabled }: ConfigEditorProps) {
  const [mode, setMode] = useState<'form' | 'text'>('form');
  const [draft, setDraft] = useState<FieldValues>(values);
  const [rawDraft, setRawDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(values), [values]);
  useEffect(() => setRawDraft(text), [text]);

  const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => value !== values[key]));
  const dirty = mode === 'form' ? Object.keys(changes).length > 0 : rawDraft !== text;

  async function save() {
    setSaving(true);
    try {
      if (mode === 'form') await onSave(changes);
      else await onSaveText(rawDraft);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDraft(values);
    setRawDraft(text);
  }

  return (
    <div className="config-editor">
      <div className="segmented">
        <button className={mode === 'form' ? 'is-active' : ''} onClick={() => setMode('form')} disabled={mode === 'text' && rawDraft !== text}>
          <Icon name="sliders" size={14} />
          Formulário
        </button>
        <button className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')} disabled={mode === 'form' && Object.keys(changes).length > 0}>
          <Icon name="code" size={14} />
          Texto
        </button>
      </div>

      {mode === 'form' ? (
        groups.map((group) => (
          <section key={group.title} className="card settings-section">
            <h3>{group.title}</h3>
            {group.description && <p className="muted small">{group.description}</p>}
            <div className="grid-fields">
              {group.fields.map((raw) => {
                const field = adjust ? adjust(raw) : raw;
                return (
                  <ConfigField
                    key={field.name}
                    field={field}
                    value={draft[field.name] ?? null}
                    saved={values[field.name] ?? null}
                    onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))}
                  />
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <section className="card settings-section">
          <h3>{fileLabel}</h3>
          <p className="muted small">Edição direta do arquivo, inclusive de chaves que o formulário não conhece.</p>
          <label className="field">
            <textarea rows={16} value={rawDraft} onChange={(e) => setRawDraft(e.target.value)} spellCheck={false} />
          </label>
        </section>
      )}

      <div className="settings-actions">
        <button className="button primary" onClick={save} disabled={!dirty || saving || disabled}>
          <Icon name="save" />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button className="button ghost" onClick={discard} disabled={!dirty || saving}>
          Descartar
        </button>
        <span className="spacer" />
        {footer}
      </div>
    </div>
  );
}
