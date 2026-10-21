export const SAFETY_PAGE_SIZE = 25
export const SAFETY_MAX_PAGE = 10_000

export type SafetyStatusFilter = 'all' | 'open' | 'triage' | 'investigating' | 'resolved' | 'closed'
export type SupportCaseStatusFilter = 'all' | 'open' | 'waiting' | 'resolved' | 'closed'
type QueryValue = string | string[] | undefined

const safetyStatuses = ['all', 'open', 'triage', 'investigating', 'resolved', 'closed'] as const
const supportCaseStatuses = ['all', 'open', 'waiting', 'resolved', 'closed'] as const

export function parseSafetyQueueParams(params: { status?: QueryValue; page?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  let status: SafetyStatusFilter = 'all'
  if (rawStatus && (safetyStatuses as readonly string[]).includes(rawStatus)) {
    status = rawStatus as SafetyStatusFilter
  } else if (params.status !== undefined) {
    issues.push('The safety status parameter is invalid; open the canonical safety queue URL.')
  }
  if (Array.isArray(params.status)) issues.push('The safety status parameter must appear only once.')

  const rawPage = typeof params.page === 'string' ? params.page : undefined
  let page = 1
  if (params.page !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > SAFETY_MAX_PAGE) {
      issues.push(`The page parameter must be a whole number from 1 to ${SAFETY_MAX_PAGE}; showing page 1.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.page)) issues.push('The page parameter must appear only once.')

  return { status, page, skip: (page - 1) * SAFETY_PAGE_SIZE, issues }
}

export function safetyIncidentWhere(status: SafetyStatusFilter) {
  return status === 'all' ? {} : { status: { equals: status } }
}

export function parseSupportCaseQueueParams(params: { caseStatus?: QueryValue; casePage?: QueryValue }) {
  const issues: string[] = []
  const rawStatus = typeof params.caseStatus === 'string' ? params.caseStatus : undefined
  let status: SupportCaseStatusFilter = 'all'
  if (rawStatus && (supportCaseStatuses as readonly string[]).includes(rawStatus)) {
    status = rawStatus as SupportCaseStatusFilter
  } else if (params.caseStatus !== undefined) {
    issues.push('The support-case status parameter is invalid; showing all cases.')
  }
  if (Array.isArray(params.caseStatus)) issues.push('The support-case status parameter must appear only once.')

  const rawPage = typeof params.casePage === 'string' ? params.casePage : undefined
  let page = 1
  if (params.casePage !== undefined) {
    const parsedPage = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : NaN
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > SAFETY_MAX_PAGE) {
      issues.push(`The support-case page parameter must be a whole number from 1 to ${SAFETY_MAX_PAGE}; showing page 1.`)
    } else {
      page = parsedPage
    }
  }
  if (Array.isArray(params.casePage)) issues.push('The support-case page parameter must appear only once.')

  return { status, page, skip: (page - 1) * SAFETY_PAGE_SIZE, issues }
}

export function supportCaseWhere(status: SupportCaseStatusFilter) {
  return status === 'all' ? {} : { status: { equals: status } }
}

export function reconcileSafetyPage(page: number, total: number, itemCount: number) {
  const pageCount = Math.max(1, Math.ceil(total / SAFETY_PAGE_SIZE))
  const offset = (page - 1) * SAFETY_PAGE_SIZE
  const expectedItemCount = Math.min(SAFETY_PAGE_SIZE, Math.max(0, total - offset))
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
    exceedsPageLimit: total > SAFETY_PAGE_SIZE * SAFETY_MAX_PAGE,
  } as const
}

export function safetyPageHref(page: number, status: SafetyStatusFilter, supportCase?: { status: SupportCaseStatusFilter; page: number }) {
  const params = new URLSearchParams()
  params.set('status', status)
  params.set('page', String(page))
  if (supportCase) {
    params.set('caseStatus', supportCase.status)
    params.set('casePage', String(supportCase.page))
  }
  return `?${params.toString()}`
}

export function supportCasePageHref(page: number, status: SupportCaseStatusFilter, safetyStatus: SafetyStatusFilter, safetyPage: number) {
  const params = new URLSearchParams()
  params.set('status', safetyStatus)
  params.set('page', String(safetyPage))
  params.set('caseStatus', status)
  params.set('casePage', String(page))
  return `?${params.toString()}`
}
