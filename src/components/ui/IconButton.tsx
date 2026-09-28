import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Tooltip } from './Tooltip';
import type { ButtonVariant } from './Button';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-500',
  secondary: 'border border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white',
  ghost: 'text-slate-400 hover:bg-slate-800 hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-500',
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    tooltipSide = 'bottom',
    type = 'button',
    className = '',
    ...props
  },
  ref
) {
  return (
    <Tooltip content={label} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={`inline-grid shrink-0 place-items-center rounded-lg outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
        {...props}
      >
        {icon}
      </button>
    </Tooltip>
  );
});
