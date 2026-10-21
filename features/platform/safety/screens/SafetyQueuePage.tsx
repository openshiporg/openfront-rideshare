import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { Badge } from '@/components/ui/badge'
import { OperationsBoard } from '@/features/platform/components/OperationsBoard'
import { SupportCaseStatusBoard } from '../components/SupportCaseStatusBoard'
import { projectSupportCaseRows } from '../domain/supportCaseProjection'
import { safetyQueueQuery } from '../domain/safetyQueueQuery'
import {
  SAFETY_MAX_PAGE,
  SAFETY_PAGE_SIZE,
  parseSafetyQueueParams,
  parseSupportCaseQueueParams,
  reconcileSafetyPage,
  safetyIncidentWhere,
  safetyPageHref,
  supportCaseWhere,
  type SafetyStatusFilter,
  type SupportCaseStatusFilter,
} from '../domain/pagination'

type SafetySearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[]; caseStatus?: string | string[]; casePage?: string | string[] }

function SafetyPagination({
  query,
  status,
  page,
  total,
  pageCount,
  firstItem,
  lastItem,
  staleReason,
  exceedsPageLimit,
  supportCaseStatus,
  supportCasePage,
}: {
  query: string
  status: SafetyStatusFilter
  supportCaseStatus: SupportCaseStatusFilter
  supportCasePage: number
  page: number
  total: number
  pageCount: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
}) {
  const reachablePageCount = Math.min(pageCount, SAFETY_MAX_PAGE)
  const label = status === 'all' ? 'incidents' : `${status} incidents`
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, SAFETY_MAX_PAGE))
    : page

  return <section aria-label="Safety queue pagination" className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason ? <div role="status" className="space-y-1">
      <p>{staleReason === 'page_out_of_range'
        ? `Page ${page} is stale; the current ${label} queue ends at page ${pageCount}.`
        : 'The scoped safety count and page rows changed during loading; reload to reconcile them.'}</p>
      <Link className="underline underline-offset-4" href={safetyPageHref(recoveryPage, status, { status: supportCaseStatus, page: supportCasePage })}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
    </div> : <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} {label} · page {page} of {reachablePageCount}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-800 dark:text-amber-300">The visible incident queue exceeds the {SAFETY_MAX_PAGE.toLocaleString()}-page navigation limit; later incidents are not reachable from this queue.</p>}
    {!staleReason && <nav aria-label="Safety incident pages" className="flex items-center gap-2">
      {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={safetyPageHref(page - 1, status, { status: supportCaseStatus, page: supportCasePage })}>Previous</Link>}
      {page < pageCount && page < SAFETY_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={safetyPageHref(page + 1, status, { status: supportCaseStatus, page: supportCasePage })}>Next</Link>}
    </nav>}
  </section>
}

export async function SafetyQueuePage({ searchParams }: { searchParams?: Promise<SafetySearchParams> } = {}) {
  const rawParams = searchParams ? await searchParams : {}
  const search = parseQueueSearch(rawParams.q)
  const query = search.query
  const selection = parseSafetyQueueParams(rawParams)
  const supportCaseSelection = parseSupportCaseQueueParams(rawParams)
  const queueIssues = [...selection.issues, ...supportCaseSelection.issues]
  if (search.issue) selection.issues.push(search.issue)
  const response = await keystoneClient(safetyQueueQuery, {
    where: { AND: [safetyIncidentWhere(selection.status), ...(query ? [{ caseNumber: { contains: query, mode: 'insensitive' } }] : [])] },
    take: SAFETY_PAGE_SIZE,
    skip: selection.skip,
    caseWhere: supportCaseWhere(supportCaseSelection.status),
    caseTake: SAFETY_PAGE_SIZE,
    caseSkip: supportCaseSelection.skip,
  })

  const data = response.success ? response.data : undefined
  const items = Array.isArray(data?.safetyIncidents) ? data.safetyIncidents : []
  const total = data?.safetyIncidentsCount
  const hasScope = response.success && data?.safetyQueueScope === true
  const loaded = response.success
    && hasScope
    && Array.isArray(data?.safetyIncidents)
    && Number.isSafeInteger(total)
    && total >= 0
    && items.length <= SAFETY_PAGE_SIZE
  const pageState = loaded ? reconcileSafetyPage(selection.page, total, items.length) : undefined
  const supportCaseItems = projectSupportCaseRows(data?.supportCases)
  const supportCaseTotal = data?.supportCasesCount
  const supportCasesLoaded = response.success
    && hasScope
    && supportCaseItems !== null
    && supportCaseItems.length <= SAFETY_PAGE_SIZE
    && Number.isSafeInteger(supportCaseTotal)
    && supportCaseTotal >= 0
  const supportCasePageState = supportCasesLoaded && supportCaseItems
    ? reconcileSafetyPage(supportCaseSelection.page, supportCaseTotal, supportCaseItems.length)
    : undefined
  const supportCaseAccessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const supportCaseLoadError = !supportCasesLoaded
    ? supportCaseAccessDenied
      ? 'Access to support cases or their scoped count was denied.'
      : response.success
        ? 'The support-case source returned an incomplete or unsafe projection/count.'
        : 'Support cases and their scoped count could not be loaded.'
    : undefined
  const accessDenied = response.success
    ? !hasScope
    : /Access denied:/i.test(response.error)
  const loadError = !loaded
    ? accessDenied
      ? 'Access to incidents or their scoped count was denied.'
      : response.success
        ? 'The safety source returned an incomplete page or scoped count.'
        : 'Safety incidents and their scoped count could not be loaded.'
    : undefined
  const pageError = pageState?.staleReason === 'page_out_of_range'
    ? 'This safety page no longer exists in the current scoped queue.'
    : pageState?.staleReason === 'count_mismatch'
      ? 'The safety queue changed while loading; reload before relying on this view.'
      : undefined
  const boardError = loadError || pageError

  return <>
    {queueIssues.length > 0 && <div role="alert" className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200 md:mx-6">
      {queueIssues.join(' ')} <Link className="underline underline-offset-4" href={safetyPageHref(selection.page, selection.status, { status: supportCaseSelection.status, page: supportCaseSelection.page })}>Open the canonical queue URL</Link>
    </div>}
    <OperationsBoard
      title="Safety & support"
      description="Restricted incident queue. This dashboard is not an emergency-services substitute. Trip relationships, identity fields, restricted details, and evidence references are omitted from this queue projection."
      items={items}
      selectedStatus={selection.status}
      queryParams={{ q: query, page: String(selection.page), caseStatus: supportCaseSelection.status, casePage: String(supportCaseSelection.page) }}
      showColumnCounts={false}
      error={boardError}
      columns={[{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'triage', label: 'Triage' }, { key: 'investigating', label: 'Investigating' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }]}
      empty="No safety incidents are visible in the current safety scope."
      render={item => <div className="flex justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><span className="font-semibold">{item.caseNumber}</span><Badge variant={item.severity === 'critical' ? 'destructive' : 'outline'}>{item.severity}</Badge></div>
          <p className="mt-2 text-sm">{item.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.category} · Reported {item.reportedAt || 'time not recorded'}</p>
        </div>
        <Badge variant="secondary">{item.status}</Badge>
      </div>}
    />
    {loaded && pageState && <div className="px-4 pb-6 md:px-6">
      <SafetyPagination
        query={query}
        status={selection.status}
        supportCaseStatus={supportCaseSelection.status}
        supportCasePage={supportCaseSelection.page}
        page={selection.page}
        total={total}
        pageCount={pageState.pageCount}
        firstItem={pageState.firstItem}
        lastItem={pageState.lastItem}
        staleReason={pageState.staleReason}
        exceedsPageLimit={pageState.exceedsPageLimit}
      />
    </div>}
    <SupportCaseStatusBoard
      items={supportCasesLoaded ? supportCaseItems ?? [] : []}
      status={supportCaseSelection.status}
      page={supportCaseSelection.page}
      pageCount={supportCasePageState?.pageCount ?? 1}
      total={supportCasesLoaded ? supportCaseTotal : 0}
      firstItem={supportCasePageState?.firstItem ?? 0}
      lastItem={supportCasePageState?.lastItem ?? 0}
      staleReason={supportCasePageState?.staleReason ?? null}
      exceedsPageLimit={supportCasePageState?.exceedsPageLimit ?? false}
      error={supportCaseLoadError}
      safetyStatus={selection.status}
      safetyPage={selection.page}
    />
  </>
}

export default SafetyQueuePage
