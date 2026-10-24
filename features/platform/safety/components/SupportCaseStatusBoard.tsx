import Link from 'next/link'
import { SupportCaseActions } from './CaseActions'
import { PillLink, PillTrack } from '@/features/platform/components/PillTabs'
import { PlatformEmpty, PlatformSection } from '@/features/platform/components/PlatformPage'
import { QueuePagination } from '@/features/platform/components/QueuePagination'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
import {
  SAFETY_MAX_PAGE,
  supportCasePageHref,
  type SafetyStatusFilter,
  type SupportCaseStatusFilter,
} from '../domain/pagination'
import type { SupportCaseQueueItem } from '../domain/supportCaseProjection'

const columns: { key: SupportCaseStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]

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
  actorId = '',
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
  actorId?: string
}) {
  return <PlatformSection id="support-cases" title="Support cases" meta={error ? undefined : total} className="border-t pt-6">
    <PillTrack label="Support case status">
      {columns.map(column => <PillLink key={column.key} href={supportCasePageHref(1, column.key, safetyStatus, safetyPage)} active={status === column.key}>{column.label}</PillLink>)}
    </PillTrack>
    {error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      : items.length && !staleReason ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {items.map(item => <li key={item.caseNumber} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <StatusTitle tone={statusTone(item.status)} status={statusLabel(item.status)} className="font-mono text-sm font-semibold">{item.caseNumber}</StatusTitle>
          <span className="text-xs text-muted-foreground">{item.category === 'trip' ? 'Trip' : 'General'} · {formatWhen(item.createdAt)}{item.trip && <> · <Link href={`/dashboard/platform/trips/${item.trip.id}`} className="font-mono hover:underline">{item.trip.confirmationCode}</Link></>}</span>
          <div className="w-full"><SupportCaseActions caseId={item.id} status={item.status} assigned={Boolean(actorId && item.assignedToId === actorId)} /></div>
        </li>)}
      </ul>
      : !staleReason && <PlatformEmpty>No support cases</PlatformEmpty>}
    {!error && <QueuePagination label="Support case pagination" noun="cases" page={page} total={total} pageCount={pageCount} maxPage={SAFETY_MAX_PAGE} firstItem={firstItem} lastItem={lastItem} staleReason={staleReason} exceedsPageLimit={exceedsPageLimit} hrefFor={next => supportCasePageHref(next, status, safetyStatus, safetyPage)} />}
  </PlatformSection>
}
