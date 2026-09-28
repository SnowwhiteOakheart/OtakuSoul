import type { LucideIcon } from 'lucide-react';
import { useId, useRef } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  panelId?: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  idPrefix?: string;
}

export function Tabs<T extends string>({ items, value, onValueChange, ariaLabel, className = '', idPrefix }: TabsProps<T>) {
  const generatedId = useId();
  const controlPrefix = idPrefix ?? generatedId;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabledItems = items.filter((item) => !item.disabled);
  const moveFocus = (currentIndex: number, direction: 1 | -1) => {
    const current = items[currentIndex];
    if (!current || enabledItems.length === 0) return;
    const enabledIndex = enabledItems.indexOf(current);
    const next = enabledItems[(enabledIndex + direction + enabledItems.length) % enabledItems.length];
    if (!next) return;
    tabRefs.current[items.indexOf(next)]?.focus();
    onValueChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex min-w-0 gap-1 overflow-x-auto border-b border-slate-800 ${className}`}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = item.value === value;
        return (
          <button
            id={`${controlPrefix}-tab-${item.value}`}
            key={item.value}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={item.panelId}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveFocus(index, 1);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveFocus(index, -1);
              } else if (event.key === 'Home' && enabledItems[0]) {
                event.preventDefault();
                onValueChange(enabledItems[0].value);
                tabRefs.current[items.indexOf(enabledItems[0])]?.focus();
              } else if (event.key === 'End' && enabledItems.at(-1)) {
                event.preventDefault();
                const last = enabledItems.at(-1)!;
                onValueChange(last.value);
                tabRefs.current[items.indexOf(last)]?.focus();
              }
            }}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-400 disabled:opacity-40 ${
              selected
                ? 'border-accent-400 text-accent-200'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
