import { useId, type InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  valueLabel?: string;
  hint?: string;
}

export const Slider = ({ label, value, onValueChange, valueLabel, hint, id, className = '', ...props }: SliderProps) => {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;

  return (
    <div className={`block space-y-2 ${className}`}>
      <span className="flex items-center justify-between gap-4 text-sm">
        <label htmlFor={controlId} className="font-medium text-slate-300">{label}</label>
        <output htmlFor={controlId} className="shrink-0 font-mono text-xs text-accent-300">
          {valueLabel ?? value}
        </output>
      </span>
      <input
        id={controlId}
        type="range"
        value={value}
        aria-describedby={hintId}
        onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-accent-500 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      {hint && <span id={hintId} className="block text-xs text-slate-500">{hint}</span>}
    </div>
  );
};
