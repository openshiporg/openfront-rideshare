'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
const dateLabel = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Time unavailable'

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
  return <section className="mt-6 space-y-4 border-t border-zinc-800 pt-6" aria-label="Complete trip history"><h2 className="font-semibold">Trip history</h2><nav aria-label="History type" className="flex flex-wrap gap-2">{(['events','payments','reviews'] as const).map(value => <Button key={value} type="button" variant={kind === value ? 'secondary' : 'outline'} aria-pressed={kind === value} onClick={() => { setPage(null); setKind(value); setCursor(null) }}>{value[0].toUpperCase() + value.slice(1)}</Button>)}</nav><div aria-live="polite">{loading ? <p role="status">Loading private history…</p> : error || !page ? <p role="alert">Private history is unavailable. Refresh to recheck your current access.</p> : !page.items.length ? <p>No {kind} on this page.</p> : <ol className="space-y-3">{page.items.map(row => <li key={row.id} className="min-w-0 break-words rounded-lg border border-zinc-800 p-3 text-sm">{kind === 'events' ? <><p>{(row.toStatus || row.eventType || 'Event').replaceAll('_',' ')}</p><p className="text-xs text-zinc-400">{dateLabel(row.occurredAt)}</p></> : kind === 'payments' ? <><p>{formatMoney(row.amountMinor, row.currencyCode || '')} · {row.status?.replaceAll('_',' ') || 'Status unavailable'}</p><p className="text-xs text-zinc-400">{dateLabel(row.createdAt)}</p></> : <><p>{row.rating === null ? 'Rating unavailable' : `${row.rating}/5`}</p><p className="whitespace-pre-wrap">{row.body}</p><p className="text-xs text-zinc-400">{dateLabel(row.submittedAt)}</p></>}</li>)}</ol>}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => { setPage(null); setCursor(null); setRefresh(value => value + 1) }}>Latest / retry</Button>{page?.nextCursor && <Button type="button" variant="outline" disabled={loading} onClick={() => { setPage(null); setCursor(page.nextCursor) }}>Older {kind}</Button>}</div></section>
}
