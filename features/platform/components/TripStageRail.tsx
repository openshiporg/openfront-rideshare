import { cn } from '@/lib/utils'
import { TRIP_STAGES, statusLabel, tripStageIndex } from '../lib/statusTone'

const SHORT: Record<string, string> = { driver_assigned: 'Assigned', driver_en_route: 'En route', driver_arrived: 'Arrived', in_progress: 'On trip', completed: 'Done' }

/** Five-stage progress rail for a trip. Cancelled and no-show trips show a single ended state instead. */
export function TripStageRail({ status, className }: { status: string; className?: string }) {
  const current = tripStageIndex(status)
  if (current < 0) return <p className={cn('text-xs font-medium text-muted-foreground', className)}>Ended · {statusLabel(status)}</p>
  return <div className={cn('min-w-0', className)}>
    <ol className="grid grid-cols-5 gap-1" aria-label={`Trip stage: ${statusLabel(status)}`}>
      {TRIP_STAGES.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={cn('h-1.5 rounded-[4px]', index <= current ? 'bg-foreground' : 'bg-muted')}><span className="sr-only">{SHORT[stage]}</span></li>)}
    </ol>
    <p className="mt-1.5 flex justify-between gap-2 text-[0.6875rem] text-muted-foreground" aria-hidden="true"><span className="font-medium text-foreground">{SHORT[TRIP_STAGES[current]]}</span><span className="tabular-nums">{current + 1}/{TRIP_STAGES.length}</span></p>
  </div>
}
