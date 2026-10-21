import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import { Badge } from '@/components/ui/badge'
import { financeQueueQuery } from '../domain/financeQueueQuery'
import {
  FINANCE_MAX_PAGE,
  FINANCE_PAGE_SIZE,
  financePageHref,
  formatPaymentAmount,
  hasBoundedPaymentProjection,
  parseFinanceQueueParams,
  paymentWhere,
  reconcileFinancePage,
  type FinanceStatusFilter,
} from '../domain/pagination'

type FinanceSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

function FinancePagination({
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
  status: FinanceStatusFilter
  page: number
  total: number
  pageCount: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
}) {
  const reachablePageCount = Math.min(pageCount, FINANCE_MAX_PAGE)
  const label = status === 'all' ? 'payments' : `${status.replaceAll('_', ' ')} payments`
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, FINANCE_MAX_PAGE))
    : page

  return <section aria-label="Finance queue pagination" className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason ? <div role="status" className="space-y-1">
      <p>{staleReason === 'page_out_of_range'
        ? `Page ${page} is stale; the current ${label} queue ends at page ${pageCount}.`
        : 'The scoped payment count and page rows changed during loading; reload to reconcile them.'}</p>
      <Link className="underline underline-offset-4" href={queueSearchHref(financePageHref(recoveryPage, status), query)}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
    </div> : <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} {label} · page {page} of {reachablePageCount}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-800 dark:text-amber-300">The visible payment queue exceeds the {FINANCE_MAX_PAGE.toLocaleString()}-page navigation limit; later payments are not reachable from this queue.</p>}
    {!staleReason && <nav aria-label="Finance payment pages" className="flex items-center gap-2">
      {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(financePageHref(page - 1, status), query)}>Previous</Link>}
      {page < pageCount && page < FINANCE_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={queueSearchHref(financePageHref(page + 1, status), query)}>Next</Link>}
    </nav>}
  </section>
}

export async function FinancePage({ searchParams }: { searchParams?: Promise<FinanceSearchParams> } = {}) {
  const rawParams = searchParams ? await searchParams : {}
  const search = parseQueueSearch(rawParams.q)
  const query = search.query
  const selection = parseFinanceQueueParams(rawParams)
  if (search.issue) selection.issues.push(search.issue)
  const response = await keystoneClient(financeQueueQuery, {
    where: { AND: [paymentWhere(selection.status), ...(query ? [{ id: { contains: query, mode: 'insensitive' } }] : [])] },
    take: FINANCE_PAGE_SIZE,
    skip: selection.skip,
  })

  const data = response.success ? response.data : undefined
  const items = Array.isArray(data?.payments) ? data.payments : []
  const total = data?.paymentsCount
  const hasScope = response.success && data?.financeQueueScope === true
  const projectionComplete = hasBoundedPaymentProjection(items)
  const loaded = response.success
    && hasScope
    && Array.isArray(data?.payments)
    && projectionComplete
    && items.length <= FINANCE_PAGE_SIZE
    && Number.isSafeInteger(total)
    && total >= 0
  const pageState = loaded ? reconcileFinancePage(selection.page, total, items.length) : undefined
  const accessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const loadError = !loaded
    ? accessDenied
      ? 'Access to payments or their scoped count was denied.'
      : response.success
        ? 'The finance source returned an incomplete page, refund count, or scoped payment count.'
        : 'Payment records and their scoped count could not be loaded.'
    : undefined
  const pageError = pageState?.staleReason === 'page_out_of_range'
    ? 'This payment page no longer exists in the current scoped queue.'
    : pageState?.staleReason === 'count_mismatch'
      ? 'The payment queue changed while loading; reload before relying on this view.'
      : undefined
  const boardError = loadError || pageError

  return <>
    {selection.issues.length > 0 && <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
      {selection.issues.join(' ')} <Link className="underline underline-offset-4" href={queueSearchHref(financePageHref(selection.page, selection.status), query)}>Open the canonical finance URL</Link>
    </div>}
    <OperationsBoard
      title="Finance"
      description="Restricted source finance evidence. Stored payment statuses are not independent provider settlement verification. Provider references, trip identities, and individual refund rows are omitted from this queue."
      items={items}
      selectedStatus={selection.status}
      queryParams={{ q: query, page: String(selection.page) }}
      showColumnCounts={false}
      error={boardError}
      columns={[
        { key: 'all', label: 'All' },
        { key: 'pending', label: 'Pending' },
        { key: 'authorized', label: 'Authorized' },
        { key: 'captured', label: 'Captured' },
        { key: 'failed', label: 'Failed' },
        { key: 'partially_refunded', label: 'Partial refund' },
        { key: 'refunded', label: 'Refunded' },
        { key: 'cancelled', label: 'Cancelled' },
      ]}
      empty="No payments are visible in the current finance scope."
      render={item => <div className="flex justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><span className="font-semibold">Payment record</span><Badge variant="outline">{item.status || 'Status unavailable'}</Badge></div>
          <p className="mt-2 text-xs text-muted-foreground">{item.refundsCount} refund record(s) in current finance scope · Created {item.createdAt || 'time not recorded'}</p>
        </div>
        <p className="text-lg font-semibold">{formatPaymentAmount(item.amountMinor, item.currencyCode)}</p>
      </div>}
    />
    {loaded && pageState && <div className="px-4 pb-6 md:px-6">
      <FinancePagination
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

export default FinancePage
