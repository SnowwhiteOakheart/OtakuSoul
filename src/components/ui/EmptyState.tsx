import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Buttons or links that get the user out of the empty state. */
  actions?: React.ReactNode;
  className?: string;
}

/** Explains why a view is empty and what to do next, instead of leaving a blank area. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, actions, className = '' }) => (
  <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}>
    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-slate-800 bg-slate-900/70 text-slate-400">
      <Icon className="h-7 w-7" />
    </div>
    <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
    {description && <p className="mt-1.5 max-w-md text-sm text-slate-400">{description}</p>}
    {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
  </div>
);
