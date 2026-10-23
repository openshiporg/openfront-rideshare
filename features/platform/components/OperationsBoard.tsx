import Link from 'next/link'
import { Search } from 'lucide-react'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { OperationalRefresh } from './OperationalRefresh'
import { PillLink, PillTrack } from './PillTabs'
import { PlatformEmpty, PlatformHeader } from './PlatformPage'

export type BoardColumn = { key: string; label: string }

/** The queue layout every rideshare operations screen shares: header, status track, search, rows, then pages. */
export function OperationsBoard({ title, meta, items, columns, empty, render, error, selectedStatus = 'all', queryParams, searchLabel = 'Search', before, after, rowKey = item => item.id }: {
  title: string
  meta?: React.ReactNode
  items: any[]
  columns: BoardColumn[]
  empty: string
  render: (item: any) => React.ReactNode
  error?: string
  selectedStatus?: string
  queryParams?: Record<string, string>
  searchLabel?: string
  before?: React.ReactNode
  after?: React.ReactNode
  rowKey?: (item: any) => string
}) {
  const activeStatus = columns.some(column => column.key === selectedStatus) ? selectedStatus : 'all'
  const visibleItems = activeStatus === 'all' ? items : items.filter(item => item.status === activeStatus)
  const filtered = activeStatus !== 'all' || Boolean(queryParams?.q)
  function columnHref(status: string) {
    const params = new URLSearchParams(queryParams)
    params.set('status', status)
    params.set('page', '1')
    return `?${params.toString()}`
  }
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: title }]} />
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PlatformHeader title={title} meta={meta} actions={<OperationalRefresh revision={new Date().toISOString()} />} />
      {before}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillTrack label={`${title} status`}>
          {columns.map(column => <PillLink key={column.key} href={columnHref(column.key)} active={activeStatus === column.key}>{column.label}</PillLink>)}
        </PillTrack>
        <form className="flex w-full min-w-0 items-center gap-2 lg:w-80" role="search">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{searchLabel}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input name="q" maxLength={100} defaultValue={queryParams?.q || ''} placeholder={searchLabel} className="h-10 w-full rounded-full border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          {Object.entries({ ...queryParams, status: activeStatus, page: '1' }).filter(([key]) => key !== 'q').map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
          <button className="h-10 shrink-0 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="submit">Search</button>
        </form>
      </div>
      {error
        ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
        : visibleItems.length
          ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{visibleItems.map(item => <li key={rowKey(item)} className="min-w-0 break-words p-4 md:px-5">{render(item)}</li>)}</ul>
          : <div className="space-y-3"><PlatformEmpty>{filtered ? 'No matching records' : empty}</PlatformEmpty>{filtered && <Link className="block text-center text-sm font-medium underline underline-offset-4" href="?status=all&page=1">Reset filters</Link>}</div>}
      {after}
    </div>
  </>
}
