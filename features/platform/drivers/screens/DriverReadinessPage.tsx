import { parseQueueSearch, queueSearchHref } from '@/features/platform/components/queueSearch'
import Link from 'next/link'
import { CarFront, FileText } from 'lucide-react'
import { AddDriverSheet } from '../components/DriverSetupActions'
import { QueueIssues, QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone } from '@/features/platform/lib/statusTone'
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
} from '../domain/pagination'

const initials = (name: unknown) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || '?'
const REQUIRED_DRIVER_DOCUMENTS = ['driver_license', 'insurance'] as const

type DriverSearchParams = { q?: string | string[]; status?: string | string[]; page?: string | string[] }

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
  const fleetResponse = await keystoneClient(`query DriverFleets { fleets(orderBy: { name: asc }, take: 50) { id name } }`)
  const fleets = fleetResponse.success && Array.isArray(fleetResponse.data?.fleets) ? fleetResponse.data.fleets : []
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

  return <OperationsBoard
    title="Drivers"
    meta={loaded ? <span className="tabular-nums">{total} {selection.status === 'all' ? (total === 1 ? 'driver' : 'drivers') : statusLabel(selection.status).toLowerCase()}</span> : null}
    searchLabel="Driver name"
    items={items}
    selectedStatus={selection.status}
    queryParams={{ q: query, page: String(selection.page) }}
    error={boardError}
    columns={[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'pending_review', label: 'In review' }, { key: 'applicant', label: 'Applicants' }, { key: 'ineligible', label: 'Ineligible' }, { key: 'paused', label: 'Paused' }, { key: 'offboarded', label: 'Offboarded' }]}
    empty="No drivers yet"
    actions={<AddDriverSheet fleets={fleets} />}
    before={<QueueIssues issues={selection.issues} href={queueSearchHref(driverPageHref(selection.page, selection.status), query)} />}
    after={loaded && pageState ? <QueuePagination label="Driver pagination" noun="drivers" page={selection.page} total={total} pageCount={pageState.pageCount} maxPage={DRIVER_MAX_PAGE} firstItem={pageState.firstItem} lastItem={pageState.lastItem} staleReason={pageState.staleReason} exceedsPageLimit={pageState.exceedsPageLimit} hrefFor={page => queueSearchHref(driverPageHref(page, selection.status), query)} /> : null}
    render={item => { const evaluation = item.policyEvaluations[0]; const expiring = item.documents.filter((document: any) => document.expiresAt && Date.parse(document.expiresAt) < Date.now() + 30 * 864e5).length; const missing = REQUIRED_DRIVER_DOCUMENTS.filter(kind => !item.documents.some((document: any) => document.kind === kind && document.status === 'accepted_evidence' && (!document.expiresAt || Date.parse(document.expiresAt) > Date.now()))); return <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold uppercase" aria-hidden="true">{initials(item.publicName)}</span>
        <div className="min-w-0 space-y-1">
          <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} className="font-semibold"><Link href={`/dashboard/platform/drivers/${item.id}`} className="hover:underline">{item.publicName}</Link></StatusTitle>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><StatusDot tone={statusTone(item.dispatchStatus)} />{statusLabel(item.dispatchStatus)}</span>
            <span className="inline-flex items-center gap-1"><CarFront className="size-3.5" aria-hidden="true" />{item.vehicles.length}{item.vehicles.length === DRIVER_VEHICLE_LIMIT ? '+' : ''} {item.vehicles.length === 1 ? 'vehicle' : 'vehicles'}</span>
            <span className="inline-flex items-center gap-1"><FileText className="size-3.5" aria-hidden="true" />{item.documents.length}{item.documents.length === DRIVER_DOCUMENT_LIMIT ? '+' : ''} {item.documents.length === 1 ? 'document' : 'documents'}</span>
            {expiring > 0 && <span className="font-medium text-amber-700 dark:text-amber-300">{expiring} expiring</span>}
          </p>
        </div>
      </div>
      {missing.length ? <p className="justify-self-start rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-200 sm:justify-self-end">Missing {missing.map(kind => kind.replaceAll('_', ' ')).join(', ')}</p>
        : <p className="justify-self-start rounded-full bg-muted px-3 py-1 text-xs font-medium sm:justify-self-end">{evaluation?.outcome ? `Check: ${statusLabel(evaluation.outcome)}` : 'Not checked'}</p>}
    </div> }}
  />
}

export default DriverReadinessPage
