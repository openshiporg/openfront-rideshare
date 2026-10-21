import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import { DispatchOfferControl } from '../components/DispatchOfferControl'
import { dispatchBoardQuery } from '../domain/dispatchBoardQuery'
import {
  DISPATCH_MAX_PAGE,
  DISPATCH_PAGE_SIZE,
  dispatchPageHref,
  dispatchRequestWhere,
  parseDispatchBoardParams,
  reconcileDispatchPage,
  type DispatchStatusFilter,
} from '../domain/pagination'

type DispatchSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

function DispatchPagination({
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
  status: DispatchStatusFilter
  page: number
  total: number
  pageCount: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
}) {
  const reachablePageCount = Math.min(pageCount, DISPATCH_MAX_PAGE)
  const label = status === 'all' ? 'open requests' : `${status} rides`
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, DISPATCH_MAX_PAGE))
    : page

  return <section aria-label="Dispatch pagination" className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason ? <div role="status" className="space-y-1">
      <p>{staleReason === 'page_out_of_range'
        ? `Page ${page} is stale; the current ${label} queue ends at page ${pageCount}.`
        : 'The scoped count and page rows changed during loading; dispatch actions are paused until the page is reloaded.'}</p>
      <Link className="underline underline-offset-4" href={queueSearchHref(dispatchPageHref(recoveryPage, status), query)}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
    </div> : <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} {label} · page {page} of {reachablePageCount}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-800 dark:text-amber-300">The queue exceeds the {DISPATCH_MAX_PAGE.toLocaleString()}-page navigation limit; later requests are not reachable from this board.</p>}
    {!staleReason && <nav aria-label="Dispatch request pages" className="flex items-center gap-2">
      {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(dispatchPageHref(page - 1, status), query)}>Previous</Link>}
      {page < pageCount && page < DISPATCH_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(dispatchPageHref(page + 1, status), query)}>Next</Link>}
    </nav>}
  </section>
}

export async function DispatchBoardPage({ searchParams }: { searchParams?: Promise<DispatchSearchParams> } = {}) {
  const rawParams = searchParams ? await searchParams : {}
  const search = parseQueueSearch(rawParams.q)
  const query = search.query
  const selection = parseDispatchBoardParams(rawParams)
  if (search.issue) selection.issues.push(search.issue)
  const response = await keystoneClient(dispatchBoardQuery, {
    where: { AND: [dispatchRequestWhere(selection.status), ...(query ? [{ requestNumber: { contains: query, mode: 'insensitive' } }] : [])] },
    take: DISPATCH_PAGE_SIZE,
    skip: selection.skip,
  })

  const data = response.success ? response.data : undefined
  const items = Array.isArray(data?.rideRequests) ? data.rideRequests : []
  const total = data?.rideRequestsCount
  const hasScope = response.success && data?.dispatchQueueScope === true
  const loaded = response.success
    && hasScope
    && Array.isArray(data?.rideRequests)
    && Number.isSafeInteger(total)
    && total >= 0
  const pageState = loaded ? reconcileDispatchPage(selection.page, total, items.length) : undefined
  const accessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const loadError = !loaded
    ? accessDenied
      ? 'Access to dispatch requests, scoped count, or candidate records was denied.'
      : response.success
        ? 'The dispatch source returned an incomplete page or scoped count.'
        : 'Dispatch requests, scoped count, or candidate records could not be loaded.'
    : undefined
  const pageError = pageState?.staleReason === 'page_out_of_range'
    ? 'This dispatch page no longer exists for the current scoped queue.'
    : pageState?.staleReason === 'count_mismatch'
      ? 'The dispatch page changed while loading; reload before taking action.'
      : undefined
  const boardError = loadError || pageError
  const actionsEnabled = loaded && !pageState?.staleReason && selection.issues.length === 0 && process.env.NODE_ENV !== 'production'

  return <>
    <div className="p-4 md:p-6"><CommandRecovery actorId={data?.authenticatedItem?.id || ''} /></div>
    {selection.issues.length > 0 && <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
      {selection.issues.join(' ')} <Link className="underline underline-offset-4" href={queueSearchHref(dispatchPageHref(selection.page, selection.status), query)}>Open the canonical page URL</Link>
    </div>}
    <OperationsBoard
      title="Dispatch"
      description="Find driver and vehicle candidates for each request. Availability and capacity are checked again before an offer is recorded."
      items={items}
      selectedStatus={selection.status}
      queryParams={{ q: query, page: String(selection.page) }}
      showColumnCounts={false}
      error={boardError}
      columns={[{ key: 'all', label: 'Open' }, { key: 'requested', label: 'Requested' }, { key: 'matching', label: 'Matching' }]}
      empty="No rides are waiting for dispatch."
      render={item => <div>
        <div className="flex items-center gap-2"><span className="font-semibold">{item.requestNumber}</span><Badge variant="secondary">{item.status}</Badge></div>
        <p className="mt-2 text-sm">{item.pickupLabel} → {item.dropoffLabel}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.passengerCount} passenger(s) · {item.requestedFor ? new Date(item.requestedFor).toLocaleString() : 'Ride now'} · {item.matchOffers.length}{item.matchOffers.length === 50 ? '+' : ''} offered/accepted record(s)</p>
        <DispatchOfferControl request={item} actorId={data?.authenticatedItem?.id} actionsEnabled={actionsEnabled} />
      </div>}
    />
    {loaded && pageState && <div className="px-4 pb-6 md:px-6">
      <DispatchPagination
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

export default DispatchBoardPage
