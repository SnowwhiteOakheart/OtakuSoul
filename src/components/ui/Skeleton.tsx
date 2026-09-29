import type { HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  className?: string;
}

/** Decorative placeholder that preserves layout while content is loading. */
export const Skeleton = ({ className = '', ...props }: SkeletonProps) => (
  <span
    aria-hidden="true"
    className={`block animate-pulse rounded-md bg-slate-800/80 motion-reduce:animate-none ${className}`}
    {...props}
  />
);

export const ViewSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} aria-busy="true" className="flex-1 overflow-hidden p-6">
    <span className="sr-only">{label}</span>
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-3 w-full max-w-md" />
      </div>
      <div className="flex gap-3 border-b border-slate-800 pb-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const AvatarSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} aria-busy="true" className="flex min-h-0 flex-1 flex-col gap-3 p-4">
    <span className="sr-only">{label}</span>
    <Skeleton className="h-9 w-full" />
    <Skeleton className="min-h-0 flex-1 w-full rounded-lg" />
  </div>
);

interface ListSkeletonProps {
  label: string;
  layout?: 'portrait' | 'cards';
}

export const ListSkeleton = ({ label, layout = 'portrait' }: ListSkeletonProps) => {
  const count = layout === 'portrait' ? 6 : 3;
  return (
    <div role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        className={
          layout === 'portrait'
            ? 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
            : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'
        }
      >
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            {layout === 'portrait' && <Skeleton className="aspect-[3/4] w-full rounded-lg" />}
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
};
