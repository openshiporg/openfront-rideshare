import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import Link from 'next/link'
import { IncidentActions } from '../components/CaseActions'
import { QueueIssues, QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
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
} from '../domain/pagination'

type SafetySearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[]; caseStatus?: string | string[]; casePage?: string | string[] }

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

  const severityClass: Record<string, string> = { critical: 'bg-red-600 text-white', high: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', medium: 'bg-amber-500/15 text-amber-800 dark:text-amber-300', low: 'bg-muted text-muted-foreground' }
  const caseParams = { status: supportCaseSelection.status, page: supportCaseSelection.page }
  return <OperationsBoard
    title="Safety & support"
    meta={loaded ? <span className="tabular-nums">{total} incidents</span> : null}
    searchLabel="Case number"
    items={items}
    selectedStatus={selection.status}
    queryParams={{ q: query, page: String(selection.page), caseStatus: supportCaseSelection.status, casePage: String(supportCaseSelection.page) }}
    error={boardError}
    columns={[{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'triage', label: 'Triage' }, { key: 'investigating', label: 'Investigating' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }]}
    empty="No incidents"
    before={<QueueIssues issues={queueIssues} href={safetyPageHref(selection.page, selection.status, caseParams)} />}
    after={<>
      {loaded && pageState && <QueuePagination label="Incident pagination" noun="incidents" page={selection.page} total={total} pageCount={pageState.pageCount} maxPage={SAFETY_MAX_PAGE} firstItem={pageState.firstItem} lastItem={pageState.lastItem} staleReason={pageState.staleReason} exceedsPageLimit={pageState.exceedsPageLimit} hrefFor={page => queueSearchHref(safetyPageHref(page, selection.status, caseParams), query)} />}
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
        actorId={data?.authenticatedItem?.id || ''}
      />
    </>}
    render={item => <div className="space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} pulse={item.status === 'open' && item.severity === 'critical'} className="font-mono text-sm font-semibold">{item.caseNumber}</StatusTitle>
        <span className={`rounded-[4px] px-2.5 py-0.5 text-xs font-medium capitalize ${severityClass[item.severity] || severityClass.low}`}>{item.severity || 'Unrated'}</span>
      </div>
      {item.summary && <p className="text-sm">{item.summary}</p>}
      <p className="text-xs text-muted-foreground"><span className="capitalize">{item.category || 'Uncategorised'}</span> · {formatWhen(item.reportedAt)}{item.trip && <> · <Link href={`/dashboard/platform/trips/${item.trip.id}`} className="font-mono hover:underline">{item.trip.confirmationCode}</Link></>}</p>
      <IncidentActions incidentId={item.id} status={item.status} assigned={Boolean(item.assignedTo?.id && item.assignedTo.id === data?.authenticatedItem?.id)} />
    </div>}
  />
}

export default SafetyQueuePage
