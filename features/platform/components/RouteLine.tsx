import { cn } from '@/lib/utils'

/** Pickup → drop-off as two stops joined by a rail: a ring for pickup, a square for drop-off. */
export function RouteLine({ pickup, dropoff, className }: { pickup?: string | null; dropoff?: string | null; className?: string }) {
  return <ol className={cn('grid min-w-0 grid-cols-[0.75rem_minmax(0,1fr)] gap-x-2.5 text-sm', className)} aria-label="Route">
    <li className="contents">
      <span className="relative flex justify-center pt-1.5" aria-hidden="true"><span className="size-2.5 rounded-[1px] border-2 border-foreground bg-background" /><span className="absolute left-1/2 top-[1.15rem] bottom-0 w-px -translate-x-1/2 bg-border" /></span>
      <span className="min-w-0 pb-1.5 [overflow-wrap:anywhere]"><span className="sr-only">Pickup: </span>{pickup || 'Pickup not recorded'}</span>
    </li>
    <li className="contents">
      <span className="relative flex justify-center pt-1.5" aria-hidden="true"><span className="absolute left-1/2 top-0 h-1.5 w-px -translate-x-1/2 bg-border" /><span className="size-2.5 rounded-[2px] bg-foreground" /></span>
      <span className="min-w-0 [overflow-wrap:anywhere]"><span className="sr-only">Drop-off: </span>{dropoff || 'Drop-off not recorded'}</span>
    </li>
  </ol>
}
