export const FINANCE_PAGE_SIZE = 25
export const FINANCE_MAX_PAGE = 10_000

export type FinanceStatusFilter =
  | 'all'
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'partially_refunded'
  | 'refunded'
  | 'cancelled'

type QueryValue = string | string[] | undefined

const financeStatuses = [
  'all', 'pending', 'authorized', 'captured', 'failed', 'partially_refunded', 'refunded', 'cancelled',
] as const

export function parseFinanceQueueParams(params: { status?: QueryValue; page?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  let status: FinanceStatusFilter = 'all'
  if (rawStatus && (financeStatuses as readonly string[]).includes(rawStatus)) {
    status = rawStatus as FinanceStatusFilter
  } else if (params.status !== undefined) {
    issues.push('The payment status parameter is invalid; open the canonical finance queue URL.')
  }
  if (Array.isArray(params.status)) issues.push('The payment status parameter must appear only once.')

  const rawPage = typeof params.page === 'string' ? params.page : undefined
  let page = 1
  if (params.page !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > FINANCE_MAX_PAGE) {
      issues.push(`The page parameter must be a whole number from 1 to ${FINANCE_MAX_PAGE}; showing page 1.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.page)) issues.push('The page parameter must appear only once.')

  return { status, page, skip: (page - 1) * FINANCE_PAGE_SIZE, issues }
}

export function paymentWhere(status: FinanceStatusFilter) {
  return status === 'all' ? {} : { status: { equals: status } }
}

export function hasBoundedPaymentProjection(items: unknown): items is Array<Record<string, unknown> & {
  id: string
  refundsCount: number
}> {
  return Array.isArray(items) && items.every(item => {
    if (!item || typeof item !== 'object') return false
    const payment = item as Record<string, unknown>
    return typeof payment.id === 'string'
      && Number.isSafeInteger(payment.refundsCount)
      && (payment.refundsCount as number) >= 0
  })
}

export function formatPaymentAmount(amountMinor: unknown, currencyCode: unknown) {
  if (!Number.isSafeInteger(amountMinor) || (amountMinor as number) < 0 || typeof currencyCode !== 'string') {
    return 'Amount unavailable'
  }
  return formatMoney(amountMinor, currencyCode)
}

export function reconcileFinancePage(page: number, total: number, itemCount: number) {
  const pageCount = Math.max(1, Math.ceil(total / FINANCE_PAGE_SIZE))
  const offset = (page - 1) * FINANCE_PAGE_SIZE
  const expectedItemCount = Math.min(FINANCE_PAGE_SIZE, Math.max(0, total - offset))
  const staleReason = itemCount !== expectedItemCount
    ? 'count_mismatch'
    : page > pageCount
      ? 'page_out_of_range'
      : null

  return {
    pageCount,
    offset,
    firstItem: total === 0 || staleReason ? 0 : offset + 1,
    lastItem: staleReason ? 0 : offset + itemCount,
    staleReason,
    exceedsPageLimit: total > FINANCE_PAGE_SIZE * FINANCE_MAX_PAGE,
  } as const
}

export function financePageHref(page: number, status: FinanceStatusFilter) {
  const params = new URLSearchParams()
  params.set('status', status)
  params.set('page', String(page))
  return `?${params.toString()}`
}
import { formatMoney } from '../../../lib/currency'
