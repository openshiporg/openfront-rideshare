export const DRIVER_PAGE_SIZE = 25
export const DRIVER_MAX_PAGE = 10_000
export const DRIVER_DOCUMENT_LIMIT = 25
export const DRIVER_VEHICLE_LIMIT = 20

export type DriverStatusFilter = 'all' | 'active' | 'pending_review' | 'ineligible' | 'applicant' | 'paused' | 'offboarded'
type QueryValue = string | string[] | undefined

const driverStatuses = ['all', 'active', 'pending_review', 'ineligible', 'applicant', 'paused', 'offboarded'] as const

export function parseDriverReadinessParams(params: { status?: QueryValue; page?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  let status: DriverStatusFilter = 'all'
  if (rawStatus && (driverStatuses as readonly string[]).includes(rawStatus)) {
    status = rawStatus as DriverStatusFilter
  } else if (params.status !== undefined) {
    issues.push('The driver status parameter is invalid; open the canonical readiness URL before continuing.')
  }
  if (Array.isArray(params.status)) issues.push('The driver status parameter must appear only once.')

  const rawPage = typeof params.page === 'string' ? params.page : undefined
  let page = 1
  if (params.page !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > DRIVER_MAX_PAGE) {
      issues.push(`The page parameter must be a whole number from 1 to ${DRIVER_MAX_PAGE}; showing page 1.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.page)) issues.push('The page parameter must appear only once.')

  return { status, page, skip: (page - 1) * DRIVER_PAGE_SIZE, issues }
}

export function driverProfileWhere(status: DriverStatusFilter) {
  return status === 'all' ? {} : { status: { equals: status } }
}

export function hasDriverReadScope(authenticatedItem: {
  role?: { canManageRoles?: boolean | null } | null
  fleetMemberships?: unknown
} | null | undefined) {
  return authenticatedItem?.role?.canManageRoles === true
    || (Array.isArray(authenticatedItem?.fleetMemberships) && authenticatedItem.fleetMemberships.length > 0)
}

export function hasBoundedDriverProjection(items: unknown): items is Array<Record<string, unknown> & {
  documents: unknown[]
  vehicles: unknown[]
  policyEvaluations: unknown[]
}> {
  return Array.isArray(items) && items.every(item => {
    if (!item || typeof item !== 'object') return false
    const driver = item as Record<string, unknown>
    return Array.isArray(driver.documents)
      && driver.documents.length <= DRIVER_DOCUMENT_LIMIT
      && Array.isArray(driver.vehicles)
      && driver.vehicles.length <= DRIVER_VEHICLE_LIMIT
      && Array.isArray(driver.policyEvaluations)
      && driver.policyEvaluations.length <= 1
  })
}

export function reconcileDriverPage(page: number, total: number, itemCount: number) {
  const pageCount = Math.max(1, Math.ceil(total / DRIVER_PAGE_SIZE))
  const offset = (page - 1) * DRIVER_PAGE_SIZE
  const expectedItemCount = Math.min(DRIVER_PAGE_SIZE, Math.max(0, total - offset))
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
    exceedsPageLimit: total > DRIVER_PAGE_SIZE * DRIVER_MAX_PAGE,
  } as const
}

export function driverPageHref(page: number, status: DriverStatusFilter) {
  const params = new URLSearchParams()
  params.set('status', status)
  params.set('page', String(page))
  return `?${params.toString()}`
}
