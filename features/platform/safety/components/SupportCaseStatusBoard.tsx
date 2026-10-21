import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  SAFETY_MAX_PAGE,
  supportCasePageHref,
  type SafetyStatusFilter,
  type SupportCaseStatusFilter,
} from '../domain/pagination'
import type { SupportCaseQueueItem } from '../domain/supportCaseProjection'

const columns: { key: SupportCaseStatusFilter; label: string }[] = [
  { key: 'all', label: 'All cases' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]

function formatCreatedAt(value: string | null) {
  if (!value) return 'time not recorded'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'time not recorded'
}

export function SupportCaseStatusBoard({
  items,
  status,
  page,
  pageCount,
  total,
  firstItem,
  lastItem,
  staleReason,
  exceedsPageLimit,
  error,
  safetyStatus,
  safetyPage,
}: {
  items: SupportCaseQueueItem[]
  status: SupportCaseStatusFilter
  page: number
  pageCount: number
  total: number
  firstItem: number
  lastItem: number
  staleReason: 'page_out_of_range' | 'count_mismatch' | null
  exceedsPageLimit: boolean
  error?: string
  safetyStatus: SafetyStatusFilter
  safetyPage: number
}) {
  const reachablePageCount = Math.min(pageCount, SAFETY_MAX_PAGE)
  const recoveryPage = staleReason === 'page_out_of_range'
    ? Math.max(1, Math.min(pageCount, SAFETY_MAX_PAGE))
    : page

  return <section aria-label="Support case status queue" className="mx-4 mb-6 space-y-4 rounded-xl border p-4 md:mx-6 md:p-5">
    <header>
      <h2 className="text-lg font-semibold">Support cases</h2>
      <p className="mt-1 text-sm text-muted-foreground">Read-only case status in your existing fleet safety scope. A stored case is not proof of acknowledgement, reply, delivery, escalation, or emergency response.</p>
    </header>
    <nav aria-label="Support case status filters" className="flex flex-wrap gap-2">
      {columns.map(column => <Link
        key={column.key}
        href={supportCasePageHref(1, column.key, safetyStatus, safetyPage)}
        aria-current={status === column.key ? 'page' : undefined}
      ><Badge variant="outline" className={`px-3 py-1.5 ${status === column.key ? 'border-primary bg-primary/10' : ''}`}>{column.label}</Badge></Link>)}
    </nav>
    {error ? <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">{error} No support cases are shown in this state; it is not an empty queue.</div>
      : staleReason ? <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
        {staleReason === 'page_out_of_range'
          ? `Page ${page} is stale; the current support-case queue ends at page ${pageCount}.`
          : 'The scoped support-case count and page changed during loading; reload to reconcile them.'}
        {' '}<Link className="underline underline-offset-4" href={supportCasePageHref(recoveryPage, status, safetyStatus, safetyPage)}>{staleReason === 'page_out_of_range' ? 'Open the last current page' : 'Reload this page'}</Link>
      </div>
        : items.length ? <div className="grid gap-3">
          {items.map(item => <Card key={item.caseNumber}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{item.caseNumber}</p>
              <p className="mt-1 text-xs text-muted-foreground">Category: {item.category === 'trip' ? 'Trip' : 'Unclassified'} · Created {formatCreatedAt(item.createdAt)}</p>
            </div>
            <Badge variant="secondary">{item.status}</Badge>
          </CardContent></Card>)}
        </div>
          : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No support cases are visible in the current safety scope.</p>}
    {!error && !staleReason && <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">Showing {firstItem}–{lastItem} of {total} cases</p>
      <nav aria-label="Support case pages" className="flex items-center gap-2">
        {page > 1 && <Link className="rounded-md border px-3 py-1.5" href={supportCasePageHref(page - 1, status, safetyStatus, safetyPage)}>Previous</Link>}
        <span>Page {page} of {reachablePageCount}</span>
        {page < pageCount && page < SAFETY_MAX_PAGE && <Link className="rounded-md border px-3 py-1.5" href={supportCasePageHref(page + 1, status, safetyStatus, safetyPage)}>Next</Link>}
      </nav>
    </div>}
    {exceedsPageLimit && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">The support-case queue exceeds the 10,000-page navigation limit; later cases are not reachable here.</p>}
  </section>
}
