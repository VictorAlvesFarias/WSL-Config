import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Tip } from './Tip';

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  /** Marks options that won't work with the current devices. */
  flagged?: boolean;
}

interface SegmentedProps<T> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/** Single-choice button group (Radix ToggleGroup: arrow keys move, Space selects). */
export function Segmented<T extends string | number>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={String(value)}
      // Radix sends "" when the active item is clicked again; keep the current value instead.
      onValueChange={(next) => {
        const option = options.find((o) => String(o.value) === next);
        if (option) onChange(option.value);
      }}
      aria-label={label}
      className={cn('flex overflow-hidden rounded border border-line-strong', className)}
    >
      {options.map((option) => (
        <Tip key={String(option.value)} content={option.hint}>
          <ToggleGroup.Item
            value={String(option.value)}
            className={cn(
              'relative h-7 min-w-0 flex-1 border-l border-line bg-panel px-2 text-[12px] font-medium whitespace-nowrap text-fg-muted outline-none first:border-l-0',
              'hover:bg-panel-2 hover:text-fg focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset',
              'data-[state=on]:bg-accent data-[state=on]:text-accent-fg',
            )}
          >
            {option.label}
            {option.flagged && <span className="absolute top-1 right-1 size-1.5 rounded-[1px] bg-warn" />}
          </ToggleGroup.Item>
        </Tip>
      ))}
    </ToggleGroup.Root>
  );
}
