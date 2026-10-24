import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import Link from 'next/link'
import { QueueIssues, QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
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
} from '../domain/pagination'

type FinanceSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

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

  return <OperationsBoard
    title="Finance"
    meta={loaded ? <span className="tabular-nums">{total} payments</span> : null}
    searchLabel="Payment ID"
    items={items}
    selectedStatus={selection.status}
    queryParams={{ q: query, page: String(selection.page) }}
    error={boardError}
    columns={[
      { key: 'all', label: 'All' },
      { key: 'pending', label: 'Pending' },
      { key: 'authorized', label: 'Authorized' },
      { key: 'captured', label: 'Captured' },
      { key: 'failed', label: 'Failed' },
      { key: 'partially_refunded', label: 'Part refund' },
      { key: 'refunded', label: 'Refunded' },
      { key: 'cancelled', label: 'Cancelled' },
    ]}
    empty="No payments yet"
    before={<QueueIssues issues={selection.issues} href={queueSearchHref(financePageHref(selection.page, selection.status), query)} />}
    after={loaded && pageState ? <QueuePagination label="Finance pagination" noun="payments" page={selection.page} total={total} pageCount={pageState.pageCount} maxPage={FINANCE_MAX_PAGE} firstItem={pageState.firstItem} lastItem={pageState.lastItem} staleReason={pageState.staleReason} exceedsPageLimit={pageState.exceedsPageLimit} hrefFor={page => queueSearchHref(financePageHref(page, selection.status), query)} /> : null}
    render={item => <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} className="font-mono text-sm font-semibold">{item.trip ? <Link href={`/dashboard/platform/trips/${item.trip.id}`} className="hover:underline">{item.trip.confirmationCode}</Link> : String(item.id).slice(-10)}</StatusTitle>
        <p className="text-xs text-muted-foreground">{formatWhen(item.createdAt)}{item.refundsCount ? ` · ${item.refundsCount} refund${item.refundsCount === 1 ? '' : 's'}` : ''}</p>
      </div>
      <p className="shrink-0 text-lg font-semibold tabular-nums">{formatPaymentAmount(item.amountMinor, item.currencyCode)}</p>
    </div>}
  />
}

export default FinancePage
