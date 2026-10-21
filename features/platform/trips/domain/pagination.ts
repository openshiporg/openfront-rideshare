export const TRIP_PAGE_SIZE = 25
export const TRIP_MAX_PAGE = 10_000

export type TripStatusFilter =
  | 'all'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

type QueryValue = string | string[] | undefined

const tripStatuses = [
  'all', 'driver_assigned', 'driver_en_route', 'driver_arrived',
  'in_progress', 'completed', 'cancelled', 'no_show',
] as const

export function parseTripBoardParams(params: { status?: QueryValue; page?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  let status: TripStatusFilter = 'all'
  if (rawStatus && (tripStatuses as readonly string[]).includes(rawStatus)) {
    status = rawStatus as TripStatusFilter
  } else if (params.status !== undefined) {
    issues.push('The trip status parameter is invalid; open the canonical trips URL before taking action.')
  }
  if (Array.isArray(params.status)) issues.push('The trip status parameter must appear only once.')

  const rawPage = typeof params.page === 'string' ? params.page : undefined
  let page = 1
  if (params.page !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > TRIP_MAX_PAGE) {
      issues.push(`The page parameter must be a whole number from 1 to ${TRIP_MAX_PAGE}; showing page 1 without trip actions.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.page)) issues.push('The page parameter must appear only once.')

  return { status, page, skip: (page - 1) * TRIP_PAGE_SIZE, issues }
}

export function tripWhere(status: TripStatusFilter) {
  return status === 'all' ? {} : { status: { equals: status } }
}

export function hasTripBoardScope(authenticatedItem: {
  role?: { canManageRoles?: boolean | null } | null
  fleetMemberships?: unknown
} | null | undefined) {
  return authenticatedItem?.role?.canManageRoles === true
    || (Array.isArray(authenticatedItem?.fleetMemberships) && authenticatedItem.fleetMemberships.length > 0)
}

export function reconcileTripPage(page: number, total: number, itemCount: number) {
  const pageCount = Math.max(1, Math.ceil(total / TRIP_PAGE_SIZE))
  const offset = (page - 1) * TRIP_PAGE_SIZE
  const expectedItemCount = Math.min(TRIP_PAGE_SIZE, Math.max(0, total - offset))
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
    exceedsPageLimit: total > TRIP_PAGE_SIZE * TRIP_MAX_PAGE,
  } as const
}

export function tripPageHref(page: number, status: TripStatusFilter) {
  const params = new URLSearchParams()
  params.set('status', status)
  params.set('page', String(page))
  return `?${params.toString()}`
}
