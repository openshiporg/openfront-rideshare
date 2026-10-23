import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type StaleReason = 'page_out_of_range' | 'count_mismatch' | null

/** Bounded page navigation for a scoped queue. A stale page links back to a current one instead of paging on. */
export function QueuePagination({ label, noun, page, total, pageCount, maxPage, firstItem, lastItem, staleReason, exceedsPageLimit, hrefFor }: {
  label: string
  noun: string
  page: number
  total: number
  pageCount: number
  maxPage: number
  firstItem: number
  lastItem: number
  staleReason: StaleReason
  exceedsPageLimit: boolean
  hrefFor: (page: number) => string
}) {
  const reachablePageCount = Math.min(pageCount, maxPage)
  const recoveryPage = staleReason === 'page_out_of_range' ? Math.max(1, reachablePageCount) : page
  const link = 'inline-flex h-9 items-center gap-1 rounded-full border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted'
  return <section aria-label={label} className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
    {staleReason
      ? <p role="status" className="text-amber-700 dark:text-amber-300">{staleReason === 'page_out_of_range' ? `Page ${page} no longer exists; this queue ends at page ${pageCount}.` : 'The queue changed while loading.'} <Link className="font-medium underline underline-offset-4" href={hrefFor(recoveryPage)}>{staleReason === 'page_out_of_range' ? 'Open last page' : 'Reload'}</Link></p>
      : <p aria-live="polite" className="tabular-nums text-muted-foreground">{total ? `${firstItem}–${lastItem} of ${total} ${noun}` : `0 ${noun}`}{reachablePageCount > 1 ? ` · page ${page} of ${reachablePageCount}` : ''}</p>}
    {exceedsPageLimit && <p role="status" className="text-amber-700 dark:text-amber-300">Only the first {maxPage.toLocaleString()} pages are reachable.</p>}
    {!staleReason && reachablePageCount > 1 && <nav aria-label={`${label} pages`} className="flex items-center gap-2">
      {page > 1 && <Link className={link} href={hrefFor(page - 1)}><ChevronLeft className="size-4" aria-hidden="true" />Previous</Link>}
      {page < pageCount && page < maxPage && <Link className={link} href={hrefFor(page + 1)}>Next<ChevronRight className="size-4" aria-hidden="true" /></Link>}
    </nav>}
  </section>
}

/** A malformed-URL banner that links to the canonical view. */
export function QueueIssues({ issues, href }: { issues: string[]; href: string }) {
  if (!issues.length) return null
  return <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{issues.join(' ')} <Link className="font-medium underline underline-offset-4" href={href}>Open canonical view</Link></p>
}
