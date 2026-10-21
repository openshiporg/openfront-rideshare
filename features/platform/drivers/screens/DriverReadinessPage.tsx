import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import { driverReadinessQuery } from '../domain/driverReadinessQuery'
import {
  DRIVER_DOCUMENT_LIMIT,
  DRIVER_MAX_PAGE,
  DRIVER_PAGE_SIZE,
  DRIVER_VEHICLE_LIMIT,
  driverPageHref,
  driverProfileWhere,
  hasBoundedDriverProjection,
  hasDriverReadScope,
  parseDriverReadinessParams,
  reconcileDriverPage,
  type DriverStatusFilter,
} from '../domain/pagination'

type DriverSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

function DriverPagination({
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
  status: DriverStatusFilter
  page: number
  total: number
  pageCount: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
}) {
  const reachablePageCount = Math.min(pageCount, DRIVER_MAX_PAGE)
  const label = status === 'all' ? 'drivers' : `${status.replaceAll('_', ' ')} drivers`
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, DRIVER_MAX_PAGE))
    : page

  return <section aria-label="Driver readiness pagination" className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason ? <div role="status" className="space-y-1">
      <p>{staleReason === 'page_out_of_range'
        ? `Page ${page} is stale; the current ${label} queue ends at page ${pageCount}.`
        : 'The scoped driver count and page rows changed during loading; reload this page to reconcile them.'}</p>
      <Link className="underline underline-offset-4" href={queueSearchHref(driverPageHref(recoveryPage, status), query)}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
    </div> : <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} {label} · page {page} of {reachablePageCount}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-800 dark:text-amber-300">The driver queue exceeds the {DRIVER_MAX_PAGE.toLocaleString()}-page navigation limit; later profiles are not reachable from this board.</p>}
    {!staleReason && <nav aria-label="Driver profile pages" className="flex items-center gap-2">
      {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(driverPageHref(page - 1, status), query)}>Previous</Link>}
      {page < pageCount && page < DRIVER_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(driverPageHref(page + 1, status), query)}>Next</Link>}
    </nav>}
  </section>
}

export async function DriverReadinessPage({ searchParams }: { searchParams?: Promise<DriverSearchParams> } = {}) {
  const rawParams = searchParams ? await searchParams : {}
  const search = parseQueueSearch(rawParams.q)
  const query = search.query
  const selection = parseDriverReadinessParams(rawParams)
  if (search.issue) selection.issues.push(search.issue)
  const response = await keystoneClient(driverReadinessQuery, {
    where: { AND: [driverProfileWhere(selection.status), ...(query ? [{ publicName: { contains: query, mode: 'insensitive' } }] : [])] },
    take: DRIVER_PAGE_SIZE,
    skip: selection.skip,
    documentsTake: DRIVER_DOCUMENT_LIMIT,
    vehiclesTake: DRIVER_VEHICLE_LIMIT,
  })

  const data = response.success ? response.data : undefined
  const items = Array.isArray(data?.driverProfiles) ? data.driverProfiles : []
  const total = data?.driverProfilesCount
  const hasScope = response.success && hasDriverReadScope(data?.authenticatedItem)
  const projectionComplete = hasBoundedDriverProjection(items)
  const loaded = response.success
    && hasScope
    && Array.isArray(data?.driverProfiles)
    && projectionComplete
    && Number.isSafeInteger(total)
    && total >= 0
  const pageState = loaded ? reconcileDriverPage(selection.page, total, items.length) : undefined
  const accessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const loadError = !loaded
    ? accessDenied
      ? 'Access to fleet driver profiles or their scoped count was denied.'
      : response.success
        ? 'The readiness source returned an incomplete page, bounded relation, or scoped count.'
        : 'Driver readiness records and their scoped count could not be loaded.'
    : undefined
  const pageError = pageState?.staleReason === 'page_out_of_range'
    ? 'This driver page no longer exists for the current scoped queue.'
    : pageState?.staleReason === 'count_mismatch'
      ? 'The driver page changed while loading; reload before relying on this view.'
      : undefined
  const boardError = loadError || pageError

  return <>
    {selection.issues.length > 0 && <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
      {selection.issues.join(' ')} <Link className="underline underline-offset-4" href={queueSearchHref(driverPageHref(selection.page, selection.status), query)}>Open the canonical page URL</Link>
    </div>}
    <OperationsBoard
      title="Drivers"
      description={`Review fleet-scoped readiness records. Each profile shows at most ${DRIVER_DOCUMENT_LIMIT} evidence rows and ${DRIVER_VEHICLE_LIMIT} vehicles; reaching a cap means more may exist. Evidence and recorded evaluations are not compliance approval or driver admission.`}
      items={items}
      selectedStatus={selection.status}
      queryParams={{ q: query, page: String(selection.page) }}
      showColumnCounts={false}
      error={boardError}
      columns={[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'pending_review', label: 'Review' }, { key: 'ineligible', label: 'Ineligible' }, { key: 'applicant', label: 'Applicants' }, { key: 'paused', label: 'Paused' }, { key: 'offboarded', label: 'Offboarded' }]}
      empty="No driver profiles are visible in this fleet scope."
      render={item => <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2"><span className="font-semibold">{item.publicName}</span><Badge variant="secondary">{item.status}</Badge><Badge variant="outline">{item.dispatchStatus}</Badge></div>
          <p className="mt-2 text-xs text-muted-foreground">{item.vehicles.length}{item.vehicles.length === DRIVER_VEHICLE_LIMIT ? '+' : ''} vehicle(s) loaded · {item.documents.length}{item.documents.length === DRIVER_DOCUMENT_LIMIT ? '+' : ''} evidence row(s) loaded</p>
        </div>
        <div className="text-right"><p className="text-sm font-medium">{item.policyEvaluations[0]?.outcome || 'Not evaluated'}</p><p className="text-xs text-muted-foreground">Recorded evaluation outcome; not an approval</p></div>
      </div>}
    />
    {loaded && pageState && <div className="px-4 pb-6 md:px-6">
      <DriverPagination
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

export default DriverReadinessPage
