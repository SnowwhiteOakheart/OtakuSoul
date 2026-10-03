import { ChevronDown } from 'lucide-react';
import { forwardRef, useId, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, id, className = '', ...props },
  ref
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const helpId = hint || error ? `${controlId}-help` : undefined;

  return (
    <label htmlFor={controlId} className="block space-y-1.5 text-sm text-slate-300">
      <span className="font-medium">{label}</span>
      <span className="relative block">
        <select
          ref={ref}
          id={controlId}
          aria-describedby={helpId}
          aria-invalid={error ? true : undefined}
          className={`min-h-10 w-full appearance-none rounded-lg border bg-slate-900 px-3 py-2 pr-9 text-sm text-slate-100 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? 'border-rose-500' : 'border-slate-700'
          } ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      </span>
      {(error || hint) && (
        <span id={helpId} className={`block text-xs ${error ? 'text-rose-400' : 'text-slate-400'}`}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
});
