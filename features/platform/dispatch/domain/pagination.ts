export const DISPATCH_PAGE_SIZE = 25
export const DISPATCH_MAX_PAGE = 10_000

export type DispatchStatusFilter = 'all' | 'requested' | 'matching' | 'cancelled' | 'expired'
type QueryValue = string | string[] | undefined

function singleValue(value: QueryValue) {
  return typeof value === 'string' ? value : undefined
}

export function parseDispatchBoardParams(params: { status?: QueryValue; page?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = singleValue(params.status)
  let status: DispatchStatusFilter = 'all'
  if (rawStatus && ['all', 'requested', 'matching', 'cancelled', 'expired'].includes(rawStatus)) {
    status = rawStatus as DispatchStatusFilter
  } else if (params.status !== undefined) {
    issues.push('The status parameter is invalid; open the canonical dispatch URL before taking action.')
  }
  if (Array.isArray(params.status)) {
    issues.push('The status parameter must appear only once.')
  }

  const rawPage = singleValue(params.page)
  let page = 1
  if (params.page !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > DISPATCH_MAX_PAGE) {
      issues.push(`The page parameter must be a whole number from 1 to ${DISPATCH_MAX_PAGE}; showing page 1 without dispatch actions.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.page)) {
    issues.push('The page parameter must appear only once.')
  }

  return { status, page, skip: (page - 1) * DISPATCH_PAGE_SIZE, issues }
}

export function hasDispatchScope(authenticatedItem: {
  role?: { canManageRoles?: boolean | null } | null
  fleetMemberships?: unknown
} | null | undefined) {
  return authenticatedItem?.role?.canManageRoles === true
    || (Array.isArray(authenticatedItem?.fleetMemberships) && authenticatedItem.fleetMemberships.length > 0)
}

export function dispatchRequestWhere(status: DispatchStatusFilter) {
  return status === 'all'
    ? { status: { in: ['requested', 'matching'] } }
    : { status: { equals: status } }
}

export function reconcileDispatchPage(page: number, total: number, itemCount: number) {
  const pageCount = Math.max(1, Math.ceil(total / DISPATCH_PAGE_SIZE))
  const offset = (page - 1) * DISPATCH_PAGE_SIZE
  const expectedItemCount = Math.min(DISPATCH_PAGE_SIZE, Math.max(0, total - offset))
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
    exceedsPageLimit: total > DISPATCH_PAGE_SIZE * DISPATCH_MAX_PAGE,
  } as const
}

export function dispatchPageHref(page: number, status: DispatchStatusFilter) {
  const params = new URLSearchParams()
  params.set('status', status)
  params.set('page', String(page))
  return `?${params.toString()}`
}
