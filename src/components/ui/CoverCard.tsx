import type React from 'react';
import { BookOpen, Library } from 'lucide-react';

interface CoverCardProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** 16:9 cover image; without one a gradient stands in. */
  cover?: string;
  title: string;
  description: string;
  /** Small label over the cover, e.g. "Collection". */
  label: string;
  /** Row under the cover: counters on the left, `status` on the right. */
  chips?: React.ReactNode;
  status?: React.ReactNode;
}

/** Card with a cover picture and the title on it, for story collections (hub and Stage gallery). */
export const CoverCard = ({ cover, title, description, label, chips, status, className, ...rest }: CoverCardProps) => (
  <button
    type="button"
    className={`group text-left rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-accent-500/60 transition-all overflow-hidden flex flex-col shadow-sm hover:shadow-accent-950/30 outline-hidden focus-visible:border-accent-400 ${className ?? ''}`}
    {...rest}
  >
    <div className="relative aspect-video w-full bg-app overflow-hidden">
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="w-full h-full bg-linear-to-br from-accent-900/60 via-slate-900 to-slate-950 flex items-center justify-center">
          <Library className="w-10 h-10 text-accent-400/60" />
        </div>
      )}
      <div className="absolute inset-0 bg-linear-to-t from-slate-950/95 via-slate-950/30 to-transparent" />
      <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-accent-200 border border-white/10">
        <Library className="w-3 h-3" />
        {label}
      </span>
      <h3 className="absolute bottom-2.5 left-3 right-3 font-bold text-base text-white drop-shadow-md group-hover:text-accent-200 transition-colors">
        {title}
      </h3>
    </div>
    <div className="p-4 flex flex-col gap-2 flex-1">
      {(chips || status) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips}
          <span className="ml-auto">{status}</span>
        </div>
      )}
      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{description}</p>
    </div>
  </button>
);

/** Small icon + number on a cover card, e.g. "📖 3"; nothing for zero. */
export const CoverCount = ({ icon: Icon, count, label, className }: { icon: typeof BookOpen; count: number; label: string; className: string }) =>
  count > 0 ? (
    <span title={label} className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 text-[11px] font-mono text-slate-300">
      <Icon className={`w-3 h-3 ${className}`} />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  ) : null;
