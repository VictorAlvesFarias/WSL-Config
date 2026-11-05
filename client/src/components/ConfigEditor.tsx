import { FileCode, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { FieldGroup } from '../fields';
import type { FieldValues } from '../types';
import { ConfigField, type FieldDefinition } from './Fields';
import { Button } from './ui/Button';
import { cn } from './ui/cn';
import { Panel, PanelHeader } from './ui/Panel';

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

  const tab = (id: 'form' | 'text', label: string, icon: ReactNode, blocked: boolean) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      disabled={blocked}
      className={cn(
        'flex h-7 items-center gap-1.5 px-3 text-[12.5px] font-medium outline-none disabled:opacity-40 [&_svg]:size-3.5',
        mode === id ? 'bg-accent text-accent-fg' : 'bg-panel text-fg-muted enabled:hover:bg-panel-2 enabled:hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <code className="flex-1 truncate font-mono text-[12px] text-fg-muted">{fileLabel}</code>
        <div className="flex overflow-hidden rounded border border-line-strong">
          {tab('form', 'Formulário', <SlidersHorizontal />, mode === 'text' && rawDraft !== text)}
          {tab('text', 'Texto', <FileCode />, mode === 'form' && Object.keys(changes).length > 0)}
        </div>
      </div>

      {mode === 'form' ? (
        groups.map((group) => (
          <Panel key={group.title}>
            <PanelHeader title={group.title} description={group.description} />
            <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
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
          </Panel>
        ))
      ) : (
        <Panel>
          <PanelHeader title={fileLabel} description="Edição direta do arquivo, inclusive de chaves que o formulário não conhece." />
          <div className="p-4">
            <textarea
              rows={18}
              value={rawDraft}
              onChange={(e) => setRawDraft(e.target.value)}
              spellCheck={false}
              className="w-full resize-y rounded border border-line-strong bg-bg p-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </div>
        </Panel>
      )}

      <div className="sticky bottom-0 flex items-center gap-2 rounded-md border border-line bg-panel/95 px-3 py-2.5 backdrop-blur">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving || disabled}>
          <Save />
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button variant="ghost" onClick={discard} disabled={!dirty || saving}>
          Descartar
        </Button>
        {dirty && <span className="text-[12px] text-warn">Alterações não salvas</span>}
        <span className="flex-1" />
        {footer}
      </div>
    </div>
  );
}
