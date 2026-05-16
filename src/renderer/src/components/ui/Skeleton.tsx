import { cn } from '@/lib/cn'

type SkeletonProps = {
  className?: string
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-bg-card',
        className,
      )}
      aria-hidden
    />
  )
}

export function SkeletonCard({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-xl border border-border-subtle bg-bg-elevated p-5',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-5/6" />
      </div>
    </div>
  )
}

export function SkeletonRing(): JSX.Element {
  return <Skeleton className="h-56 w-56 rounded-2xl" />
}

export function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-3">
      <Skeleton className="h-3 w-3 rounded-2xl" />
      <Skeleton className="h-3 flex-1" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

export function SkeletonGrid(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

/** Container plein-page : centré, padding cohérent. */
export function PageSkeleton({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
      {children}
    </div>
  )
}
