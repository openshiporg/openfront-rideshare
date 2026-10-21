import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
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
  type TripStatusFilter,
} from '../domain/pagination'

type TripSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

function TripPagination({
  query,
  status,
  page,
  total,
  pageCount,
  firstItem,
  lastItem,
  staleReason,
  exceedsPageLimit,
}: {
  query: string
  status: TripStatusFilter
  page: number
  total: number
  pageCount: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
}) {
  const reachablePageCount = Math.min(pageCount, TRIP_MAX_PAGE)
  const label = status === 'all' ? 'trips' : `${status.replaceAll('_', ' ')} trips`
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, TRIP_MAX_PAGE))
    : page

  return <section aria-label="Trip pagination" className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason ? <div role="status" className="space-y-1">
      <p>{staleReason === 'page_out_of_range'
        ? `Page ${page} is stale; the current ${label} queue ends at page ${pageCount}.`
        : 'The scoped count and trip rows changed during loading; trip actions are paused until the page is reloaded.'}</p>
      <Link className="underline underline-offset-4" href={queueSearchHref(tripPageHref(recoveryPage, status), query)}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
    </div> : <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} {label} · page {page} of {reachablePageCount}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-800 dark:text-amber-300">The trip queue exceeds the {TRIP_MAX_PAGE.toLocaleString()}-page navigation limit; older trips beyond this range are not reachable from this board.</p>}
    {!staleReason && <nav aria-label="Trip pages" className="flex items-center gap-2">
      {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(tripPageHref(page - 1, status), query)}>Previous</Link>}
      {page < pageCount && page < TRIP_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(tripPageHref(page + 1, status), query)}>Next</Link>}
    </nav>}
  </section>
}

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

  return <>
    <div className="p-4 md:p-6"><CommandRecovery actorId={data?.authenticatedItem?.id || ''} /></div>
    {selection.issues.length > 0 && <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
      {selection.issues.join(' ')} <Link className="underline underline-offset-4" href={queueSearchHref(tripPageHref(selection.page, selection.status), query)}>Open the canonical page URL</Link>
    </div>}
    <OperationsBoard
      title="Trips"
      description="Operate scheduled, active, and completed trips through controlled transitions. Commands require fleet-scoped access and remain disabled in production."
      items={items}
      selectedStatus={selection.status}
      queryParams={{ q: query, page: String(selection.page) }}
      showColumnCounts={false}
      error={boardError}
      columns={[
        { key: 'all', label: 'All' },
        { key: 'driver_assigned', label: 'Assigned' },
        { key: 'driver_en_route', label: 'En route' },
        { key: 'driver_arrived', label: 'Arrived' },
        { key: 'in_progress', label: 'In trip' },
        { key: 'completed', label: 'Completed' },
        { key: 'cancelled', label: 'Cancelled' },
        { key: 'no_show', label: 'No-show' },
      ]}
      empty="No trips are visible in this fleet scope."
      render={item => <div>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className="font-semibold">{item.confirmationCode}</span><Badge variant="outline">{item.status.replaceAll('_', ' ')}</Badge></div>
            <p className="mt-2 text-sm">{item.pickupLabel} → {item.dropoffLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.driver?.publicName || 'Unassigned'} · {item.vehicle?.label || 'No vehicle'}</p>
          </div>
          <p className="text-xs text-muted-foreground">{item.scheduledFor ? new Date(item.scheduledFor).toLocaleString() : 'On demand'}</p>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Rider status and history stay with the original private request receipt or owning account. This operator board never issues a rider secret or confirms notification delivery.</p>
        <TripOperatorActions tripId={item.id} status={item.status} actorId={data?.authenticatedItem?.id} acceptedOfferId={item.acceptedOffer?.id} actionsEnabled={actionsEnabled} />
        <TripHandoffHistory tripId={item.id} revision={item.updatedAt} />
      </div>}
    />
    {loaded && pageState && <div className="px-4 pb-6 md:px-6">
      <TripPagination
        query={query}
        status={selection.status}
        page={selection.page}
        total={total}
        pageCount={pageState.pageCount}
        firstItem={pageState.firstItem}
        lastItem={pageState.lastItem}
        staleReason={pageState.staleReason}
        exceedsPageLimit={pageState.exceedsPageLimit}
      />
    </div>}
  </>
}

export default TripBoardPage
