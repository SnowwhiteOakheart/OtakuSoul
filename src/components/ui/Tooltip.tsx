import { Children, cloneElement, useId, type ReactElement, type ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

const SIDE_CLASSES = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  bottom: 'left-1/2 top-full mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
} as const;

export const Tooltip = ({ content, children, side = 'top' }: TooltipProps) => {
  const tooltipId = useId();
  const child = Children.only(children);
  const describedBy = [child.props['aria-describedby'], tooltipId].filter(Boolean).join(' ');

  return (
    <span className="group/tooltip relative inline-flex">
      {cloneElement(child, { 'aria-describedby': describedBy })}
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute z-[10020] w-max max-w-64 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-normal text-slate-200 opacity-0 shadow-lg transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 ${SIDE_CLASSES[side]}`}
      >
        {content}
      </span>
    </span>
  );
};
