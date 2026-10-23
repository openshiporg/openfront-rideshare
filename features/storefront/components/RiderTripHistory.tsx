'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { StatusDot } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone } from '@/features/platform/lib/statusTone'
import { RiderButton, RiderPill, RiderTrack } from './RiderPills'
import { formatMoney } from '@/features/lib/currency'
import { storedReceipt } from '../domain/riderReceiptStorage'

type Kind = 'events' | 'payments' | 'reviews'
type Row = { id: string; eventType?: string; toStatus?: string | null; occurredAt?: string | null; createdAt?: string | null; amountMinor?: number | null; currencyCode?: string | null; status?: string | null; rating?: number | null; body?: string | null; submittedAt?: string | null }
type Page = { requestId: string; tripId: string; kind: Kind; items: Row[]; nextCursor: string | null }
function isPage(value: any, requestId: string, tripId: string, kind: Kind): value is Page {
  return value?.requestId === requestId && value.tripId === tripId && value.kind === kind && (value.nextCursor === null || typeof value.nextCursor === 'string') && Array.isArray(value.items) && value.items.length <= (kind === 'events' ? 100 : 20) && value.items.every((row: any) => {
    if (typeof row?.id !== 'string' || !row.id) return false
    if (kind === 'events') return typeof row.eventType === 'string' && (row.toStatus === null || typeof row.toStatus === 'string') && (row.occurredAt === null || Number.isFinite(Date.parse(row.occurredAt)))
    if (kind === 'reviews') return row.status === 'published' && (row.body === null || typeof row.body === 'string') && (row.rating === null || Number.isInteger(row.rating) && row.rating >= 1 && row.rating <= 5)
    return (row.status === null || typeof row.status === 'string') && (row.currencyCode === null || typeof row.currencyCode === 'string')
  })
}
const dateLabel = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unavailable'

export function RiderTripHistory({ requestId, tripId }: { requestId: string; tripId: string }) {
  const [kind, setKind] = useState<Kind>('events')
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const invalidate = () => { setPage(null); setCursor(null); setRefresh(value => value + 1) }
    window.addEventListener('focus', invalidate); window.addEventListener('online', invalidate)
    return () => { window.removeEventListener('focus', invalidate); window.removeEventListener('online', invalidate) }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    let active = true
    setPage(null); setLoading(true); setError(false)
    void (async () => {
      try {
        let proof: string | null = null
        try { proof = storedReceipt(sessionStorage, requestId)?.requestProof || null } catch { /* native owner may still read */ }
        const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ query: `query RiderHistory($requestId: ID!, $proof: String, $kind: String!, $cursor: String) { riderTripHistory(requestId: $requestId, requestProof: $proof, kind: $kind, cursor: $cursor) }`, variables: { requestId, proof, kind, cursor } }) })
        const payload = await response.json()
        const result = payload.data?.riderTripHistory
        if (!response.ok || payload.errors?.length || !isPage(result, requestId, tripId, kind)) throw new Error()
        if (active && !controller.signal.aborted) setPage(result)
      } catch { if (active) setError(true) }
      finally { if (active) setLoading(false); window.clearTimeout(timeout) }
    })()
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [requestId, tripId, kind, cursor, refresh])
  const label = { events: 'Updates', payments: 'Payments', reviews: 'Reviews' } as const
  return <section className="space-y-4" aria-labelledby="trip-history-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="trip-history-title" className="font-display text-xl font-bold [font-stretch:115%]">History</h2>
      <RiderTrack label="History type">{(['events', 'payments', 'reviews'] as const).map(value => <RiderPill key={value} active={kind === value} onClick={() => { setPage(null); setKind(value); setCursor(null) }}>{label[value]}</RiderPill>)}</RiderTrack>
    </div>
    <div aria-live="polite">{loading ? <p role="status" className="text-sm text-muted-foreground">Loading…</p> : error || !page ? <p role="alert" className="text-sm text-[#ff8a7f]">History unavailable. Try again.</p> : !page.items.length ? <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No {label[kind].toLowerCase()}</p> : <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-kerb">{page.items.map(row => <li key={row.id} className="min-w-0 break-words px-4 py-3 text-sm">
      {kind === 'events' ? <div className="flex items-center gap-3"><StatusDot tone={statusTone(row.toStatus || row.eventType)} /><span className="font-medium">{statusLabel(row.toStatus || row.eventType || 'Update')}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{dateLabel(row.occurredAt)}</span></div>
        : kind === 'payments' ? <div className="flex items-center gap-3"><StatusDot tone={statusTone(row.status)} /><span className="min-w-0"><span className="block font-semibold tabular-nums">{formatMoney(row.amountMinor, row.currencyCode || '')}</span><span className="block text-xs text-muted-foreground">{statusLabel(row.status)}</span></span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{dateLabel(row.createdAt)}</span></div>
        : <div className="space-y-1.5"><div className="flex items-center gap-2">{row.rating === null ? <span className="text-xs text-muted-foreground">No rating</span> : <span className="inline-flex gap-0.5" aria-label={`${row.rating} out of 5`}>{[1, 2, 3, 4, 5].map(star => <Star key={star} aria-hidden="true" className={`size-4 ${star <= (row.rating || 0) ? 'fill-signal text-signal' : 'text-lane'}`} />)}</span>}<span className="ml-auto text-xs tabular-nums text-muted-foreground">{dateLabel(row.submittedAt)}</span></div>{row.body && <p className="whitespace-pre-wrap text-muted-foreground">{row.body}</p>}</div>}
    </li>)}</ol>}</div>
    {(cursor || page?.nextCursor || error) && <RiderTrack><RiderButton disabled={loading} onClick={() => { setPage(null); setCursor(null); setRefresh(value => value + 1) }}>{error ? 'Try again' : 'Latest'}</RiderButton>{page?.nextCursor && <RiderButton disabled={loading} onClick={() => { setPage(null); setCursor(page.nextCursor) }}>Older</RiderButton>}</RiderTrack>}
  </section>
}
