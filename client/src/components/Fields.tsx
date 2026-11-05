import { FolderOpen, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import type { FieldValue, LogEntry } from '../types';
import { LogView } from './LogView';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { cn } from './ui/cn';
import { FormField, Input, Select } from './ui/Input';

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
    <FormField label={label} hint={hint} className={className}>
      <div className="flex gap-2">
        <Input className="font-mono text-[12.5px]" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
        <Button onClick={() => void browse()} disabled={picking}>
          <FolderOpen />
          {picking ? 'Aguardando…' : 'Procurar…'}
        </Button>
      </div>
    </FormField>
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
    <span className="flex items-center gap-2">
      {field.label}
      {changed && <Badge tone="warn">alterado</Badge>}
    </span>
  );
  const hint = `${field.help ? `${field.help} ` : ''}Padrão: ${field.defaultText}.`;
  const className = field.wide ? 'md:col-span-2' : undefined;

  if (field.kind === 'bool') {
    return (
      <FormField label={label} hint={hint} className={className}>
        <Select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
          <option value="">Padrão do WSL</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </Select>
      </FormField>
    );
  }

  if (field.kind === 'enum') {
    return (
      <FormField label={label} hint={hint} className={className}>
        <Select value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Padrão do WSL</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormField>
    );
  }

  if (field.kind === 'text') {
    return (
      <FormField label={label} hint={hint} className={className}>
        <Input value={(value as string | null) ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder={field.placeholder ?? 'Padrão do WSL'} />
      </FormField>
    );
  }

  // int and size: sizes are edited in GB (or MB) and sent in MB.
  const factor = field.kind === 'size' && field.unit !== 'MB' ? 1024 : 1;
  const shown = typeof value === 'number' ? String(Math.round((value / factor) * 100) / 100) : '';
  return (
    <FormField label={label} hint={hint} className={className}>
      <UnitInput unit={field.kind === 'size' ? (field.unit ?? 'GB') : undefined}>
        <Input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={shown}
          placeholder="Padrão do WSL"
          onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * factor))}
          className={field.kind === 'size' ? 'pr-10' : undefined}
        />
      </UnitInput>
    </FormField>
  );
}

/** An input with its unit (GB, MB) drawn inside, on the right. */
export function UnitInput({ unit, children }: { unit?: string; children: ReactNode }) {
  if (!unit) return <>{children}</>;
  return (
    <div className="relative">
      {children}
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-fg-subtle">{unit}</span>
    </div>
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
    <FormField
      label={
        <>
          Digite <code className="rounded bg-panel-2 px-1 font-mono">{expected}</code> para confirmar
        </>
      }
    >
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </FormField>
  );
}

/** Red box with what went wrong in a form. */
export function FormError({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] leading-relaxed text-danger">{children}</p>;
}

/** Amber note: something to know before going on. */
export function Warn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn', className)}>
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Muted explanation under a form. */
export const Note = ({ children }: { children: ReactNode }) => <p className="text-[12.5px] leading-relaxed text-fg-muted">{children}</p>;

/** Two or three big options to pick one from. */
export function RadioCards<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: ReactNode; hint: ReactNode }>; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              selected ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-line-strong hover:bg-panel-2',
            )}
          >
            <span className={cn('text-[13px] font-medium', selected && 'text-accent')}>{option.label}</span>
            <span className="text-[12px] text-fg-muted">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A page with the activity log beside it (below it on narrow windows). */
export function WithLog({ log, children }: { log: LogEntry[]; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(300px,380px)] max-lg:grid-cols-1 max-lg:overflow-auto">
      <div className="min-h-0 overflow-auto">{children}</div>
      <div className="flex min-h-0 flex-col border-l border-line bg-sidebar/40 p-3 max-lg:h-80 max-lg:border-t max-lg:border-l-0">
        <LogView entries={log} className="flex-1" />
      </div>
    </div>
  );
}
