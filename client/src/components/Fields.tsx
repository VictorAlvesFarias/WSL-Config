import { useState, type ReactNode } from 'react';
import { api } from '../api';
import type { FieldValue } from '../types';
import { Icon } from './Icon';

interface PathInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: 'folder' | 'image' | 'any';
  placeholder?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

/** Path typed by hand or picked with the native Windows dialog (the page can't read real paths). */
export function PathInput({ label, value, onChange, kind, placeholder, hint, required, className }: PathInputProps) {
  const [picking, setPicking] = useState(false);

  async function browse() {
    setPicking(true);
    try {
      const { path } = kind === 'folder' ? await api.pickFolder() : await api.pickFile(kind);
      if (path) onChange(path);
    } finally {
      setPicking(false);
    }
  }

  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      <div className="input-row">
        <input className="mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} required={required} />
        <button type="button" className="button" onClick={browse} disabled={picking}>
          <Icon name="folder" />
          {picking ? 'Aguardando…' : 'Procurar…'}
        </button>
      </div>
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export interface FieldDefinition {
  name: string;
  label: string;
  kind: 'bool' | 'int' | 'size' | 'text' | 'enum';
  help?: string;
  /** What WSL does when the key is absent. */
  defaultText: string;
  options?: Array<{ value: string; label: string }>;
  /** size: unit shown in the input (values travel in MB). */
  unit?: 'GB' | 'MB';
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  wide?: boolean;
}

interface ConfigFieldProps {
  field: FieldDefinition;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  /** Value saved in the file, to mark fields edited but not saved yet. */
  saved: FieldValue;
}

/**
 * One key of an INI file. Every field can be left "padrão", which removes the key so WSL uses its
 * own default; that is different from writing the default value explicitly.
 */
export function ConfigField({ field, value, onChange, saved }: ConfigFieldProps) {
  const changed = value !== saved;
  const label = (
    <span className="field-label">
      {field.label}
      {changed && <span className="chip chip-warn">alterado</span>}
    </span>
  );
  const help = <small className="muted">{field.help ? `${field.help} ` : ''}Padrão: {field.defaultText}.</small>;

  if (field.kind === 'bool') {
    return (
      <label className={`field${field.wide ? ' wide' : ''}`}>
        {label}
        <select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
          <option value="">Padrão do WSL</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
        {help}
      </label>
    );
  }

  if (field.kind === 'enum') {
    return (
      <label className={`field${field.wide ? ' wide' : ''}`}>
        {label}
        <select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Padrão do WSL</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {help}
      </label>
    );
  }

  if (field.kind === 'text') {
    return (
      <label className={`field${field.wide ? ' wide' : ''}`}>
        {label}
        <input value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder={field.placeholder ?? 'Padrão do WSL'} spellCheck={false} />
        {help}
      </label>
    );
  }

  // int and size: sizes are edited in GB (or MB) and sent in MB.
  const factor = field.kind === 'size' && field.unit !== 'MB' ? 1024 : 1;
  const shown = typeof value === 'number' ? String(Math.round((value / factor) * 100) / 100) : '';
  return (
    <label className={`field${field.wide ? ' wide' : ''}`}>
      {label}
      <div className="input-unit">
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={shown}
          placeholder="Padrão do WSL"
          onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * factor))}
        />
        {field.kind === 'size' && <span>{field.unit ?? 'GB'}</span>}
      </div>
      {help}
    </label>
  );
}

interface ConfirmNameProps {
  expected: string;
  value: string;
  onChange: (value: string) => void;
}

/** Destructive actions ask for the distro name, like GitHub does for repositories. */
export function ConfirmName({ expected, value, onChange }: ConfirmNameProps) {
  return (
    <label className="field">
      <span>
        Digite <code>{expected}</code> para confirmar
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
    </label>
  );
}
