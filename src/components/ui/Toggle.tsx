import type { ButtonHTMLAttributes } from 'react';

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export const Toggle = ({ checked, onCheckedChange, label, description, disabled, className = '', ...props }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={`flex w-full items-center justify-between gap-4 rounded-lg p-2 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-slate-200">{label}</span>
      {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
    </span>
    <span
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? 'border-accent-400 bg-accent-600' : 'border-slate-600 bg-slate-800'
      }`}
      aria-hidden
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);
