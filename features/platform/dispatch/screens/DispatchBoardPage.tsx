import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import { Clock, Users } from 'lucide-react'
import { QueueIssues, QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { RouteLine } from '@/features/platform/components/RouteLine'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
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
} from '../domain/pagination'

type DispatchSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

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

  const actorId = data?.authenticatedItem?.id || ''
  return <OperationsBoard
    title="Dispatch"
    meta={loaded ? <span className="tabular-nums">{total} waiting</span> : null}
    searchLabel="Request number"
    items={items}
    selectedStatus={selection.status}
    queryParams={{ q: query, page: String(selection.page) }}
    error={boardError}
    columns={[{ key: 'all', label: 'Open' }, { key: 'requested', label: 'Requested' }, { key: 'matching', label: 'Matching' }]}
    empty="No rides waiting for a driver"
    before={<>
      <QueueIssues issues={selection.issues} href={queueSearchHref(dispatchPageHref(selection.page, selection.status), query)} />
      <CommandRecovery actorId={actorId} />
    </>}
    after={loaded && pageState ? <QueuePagination label="Dispatch pagination" noun={selection.status === 'all' ? 'open requests' : `${selection.status} requests`} page={selection.page} total={total} pageCount={pageState.pageCount} maxPage={DISPATCH_MAX_PAGE} firstItem={pageState.firstItem} lastItem={pageState.lastItem} staleReason={pageState.staleReason} exceedsPageLimit={pageState.exceedsPageLimit} hrefFor={page => queueSearchHref(dispatchPageHref(page, selection.status), query)} /> : null}
    render={item => <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:gap-6">
      <div className="min-w-0 space-y-2">
        <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} pulse={item.status === 'matching'} className="font-mono text-sm font-semibold">{item.requestNumber}</StatusTitle>
        <RouteLine pickup={item.pickupLabel} dropoff={item.dropoffLabel} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" />{item.passengerCount || 1}</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{item.requestedFor ? formatWhen(item.requestedFor) : 'Now'}</span>
          <span className="tabular-nums">{item.matchOffers.length}{item.matchOffers.length === 50 ? '+' : ''} live offers</span>
        </p>
      </div>
      <DispatchOfferControl request={item} actorId={actorId} actionsEnabled={actionsEnabled} />
    </div>}
  />
}

export default DispatchBoardPage
