import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import { CarFront, Clock, UserRound } from 'lucide-react'
import { QueueIssues, QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { RouteLine } from '@/features/platform/components/RouteLine'
import { TripStageRail } from '@/features/platform/components/TripStageRail'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import { TripOperatorActions } from '../components/TripOperatorActions'
import { TripHandoffHistory } from '../components/TripHandoffHistory'
import { tripBoardQuery } from '../domain/tripBoardQuery'
import {
  TRIP_MAX_PAGE,
  TRIP_PAGE_SIZE,
  hasTripBoardScope,
  parseTripBoardParams,
  reconcileTripPage,
  tripPageHref,
  tripWhere,
} from '../domain/pagination'

type TripSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

export async function TripBoardPage({ searchParams }: { searchParams?: Promise<TripSearchParams> } = {}) {
  const rawParams = searchParams ? await searchParams : {}
  const search = parseQueueSearch(rawParams.q)
  const query = search.query
  const selection = parseTripBoardParams(rawParams)
  if (search.issue) selection.issues.push(search.issue)
  const response = await keystoneClient(tripBoardQuery, {
    where: { AND: [tripWhere(selection.status), ...(query ? [{ confirmationCode: { contains: query, mode: 'insensitive' } }] : [])] },
    take: TRIP_PAGE_SIZE,
    skip: selection.skip,
  })

  const data = response.success ? response.data : undefined
  const items = Array.isArray(data?.trips) ? data.trips : []
  const total = data?.tripsCount
  const hasScope = response.success && hasTripBoardScope(data?.authenticatedItem)
  const loaded = response.success
    && hasScope
    && Array.isArray(data?.trips)
    && Number.isSafeInteger(total)
    && total >= 0
  const pageState = loaded ? reconcileTripPage(selection.page, total, items.length) : undefined
  const accessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const loadError = !loaded
    ? accessDenied
      ? 'Access to fleet trips or the scoped count was denied.'
      : response.success
        ? 'The trip source returned an incomplete page or scoped count.'
        : 'Trip records and their scoped count could not be loaded.'
    : undefined
  const pageError = pageState?.staleReason === 'page_out_of_range'
    ? 'This trip page no longer exists for the current scoped queue.'
    : pageState?.staleReason === 'count_mismatch'
      ? 'The trip page changed while loading; reload before taking action.'
      : undefined
  const boardError = loadError || pageError
  const actionsEnabled = loaded && !pageState?.staleReason && selection.issues.length === 0 && process.env.NODE_ENV !== 'production'

  const actorId = data?.authenticatedItem?.id || ''
  return <OperationsBoard
    title="Trips"
    meta={loaded ? <span className="tabular-nums">{total} {selection.status === 'all' ? 'trips' : statusLabel(selection.status).toLowerCase()}</span> : null}
    searchLabel="Confirmation code"
    items={items}
    selectedStatus={selection.status}
    queryParams={{ q: query, page: String(selection.page) }}
    error={boardError}
    columns={[
      { key: 'all', label: 'All' },
      { key: 'driver_assigned', label: 'Assigned' },
      { key: 'driver_en_route', label: 'En route' },
      { key: 'driver_arrived', label: 'Arrived' },
      { key: 'in_progress', label: 'On trip' },
      { key: 'completed', label: 'Completed' },
      { key: 'cancelled', label: 'Cancelled' },
      { key: 'no_show', label: 'No-show' },
    ]}
    empty="No trips yet"
    before={<>
      <QueueIssues issues={selection.issues} href={queueSearchHref(tripPageHref(selection.page, selection.status), query)} />
      <CommandRecovery actorId={actorId} />
    </>}
    after={loaded && pageState ? <QueuePagination label="Trip pagination" noun="trips" page={selection.page} total={total} pageCount={pageState.pageCount} maxPage={TRIP_MAX_PAGE} firstItem={pageState.firstItem} lastItem={pageState.lastItem} staleReason={pageState.staleReason} exceedsPageLimit={pageState.exceedsPageLimit} hrefFor={page => queueSearchHref(tripPageHref(page, selection.status), query)} /> : null}
    render={item => <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-6">
        <div className="min-w-0 space-y-2">
          <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} pulse={['driver_en_route', 'in_progress'].includes(item.status)} className="font-mono text-sm font-semibold">{item.confirmationCode}</StatusTitle>
          <RouteLine pickup={item.pickupLabel} dropoff={item.dropoffLabel} />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" aria-hidden="true" />{item.driver?.publicName || 'No driver'}</span>
            <span className="inline-flex items-center gap-1"><CarFront className="size-3.5" aria-hidden="true" />{item.vehicle?.label || 'No vehicle'}{item.vehicle?.plateMasked ? ` · ${item.vehicle.plateMasked}` : ''}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{item.scheduledFor ? formatWhen(item.scheduledFor) : 'On demand'}</span>
          </p>
        </div>
        <TripStageRail status={item.status} className="md:w-60" />
      </div>
      <TripOperatorActions tripId={item.id} status={item.status} actorId={actorId} acceptedOfferId={item.acceptedOffer?.id} actionsEnabled={actionsEnabled} />
      <TripHandoffHistory tripId={item.id} revision={item.updatedAt} />
    </div>}
  />
}

export default TripBoardPage
