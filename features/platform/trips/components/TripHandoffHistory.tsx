'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Handoff = { nextCursor: string | null; available: boolean; tripId: string; status: string; requestId: string | null; requestNumber: string | null; requestStatus: string | null; acceptedOfferId: string | null; historyTruncated: boolean; events: Array<{ eventType: string; toStatus: string | null; occurredAt: string }> }

export function TripHandoffHistory({ tripId, revision }: { tripId: string; revision?: string }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [observedAt, setObservedAt] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    controllerRef.current?.abort(); controllerRef.current = null
    setHandoff(null); setChecked(false); setLoading(false); setCursor(null); setObservedAt('')
    return () => controllerRef.current?.abort()
  }, [tripId, revision])
  async function refresh(nextCursor: string | null = null) {
    if (controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    setLoading(true); setError(false); setHandoff(null)
    try {
      const response = await fetch('/api/graphql', { signal: controller.signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        query: `query OperatorHandoff($tripId: ID!, $cursor: String) { operatorTripHandoff(tripId: $tripId, cursor: $cursor) { nextCursor  available tripId status requestId requestNumber requestStatus acceptedOfferId historyTruncated events { eventType toStatus occurredAt } } }`, variables: { tripId, cursor: nextCursor },
      }) })
      if (!response.ok) throw new Error('Unavailable')
      const payload = await response.json()
      if (payload.errors?.length) throw new Error('Unavailable')
      const detail = payload.data?.operatorTripHandoff || null
      if (detail && (detail.tripId !== tripId || typeof detail.available !== 'boolean' || !Array.isArray(detail.events))) throw new Error('Unavailable')
      if (controllerRef.current === controller && !controller.signal.aborted) { setHandoff(detail); setChecked(true); setCursor(nextCursor); setObservedAt(new Date().toLocaleTimeString()) }
    } catch { if (controllerRef.current === controller) setError(true) }
    finally { window.clearTimeout(timeout); if (controllerRef.current === controller) { controllerRef.current = null; setLoading(false) } }
  }
  return <section className="mt-4 space-y-3 border-t pt-3" aria-live="polite"><Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>{loading ? 'Loading history…' : checked ? 'Refresh latest history' : 'Read handoff and history'}</Button>{error ? <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">History is unavailable. Retry this read to check the latest status.</p> : checked && !loading && !handoff ? <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Handoff unavailable or outside your current fleet authority.</p> : handoff && <div className="space-y-2 text-xs"><p>Trip at {observedAt}: {handoff.status.replaceAll('_', ' ')}</p>{!handoff.available ? <p className="text-amber-800 dark:text-amber-300">Assignment details are unavailable. Reconciliation is required.</p> : <><p>Request {handoff.requestNumber} · {handoff.requestStatus?.replaceAll('_', ' ')}</p><p className="break-all text-muted-foreground">Request ID {handoff.requestId} · accepted offer {handoff.acceptedOfferId}</p><ol className="space-y-1">{handoff.events.map((event, index) => <li key={`${event.eventType}:${event.occurredAt}:${index}`}>{event.toStatus?.replaceAll('_', ' ') || event.eventType.replaceAll('_', ' ')} · {new Date(event.occurredAt).toLocaleString()}</li>)}</ol>{handoff.historyTruncated && <p className="text-amber-800 dark:text-amber-300">More history is available below.</p>}<div className="flex flex-wrap gap-2">{cursor && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>Latest events</Button>}{handoff.nextCursor && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh(handoff.nextCursor)}>Older events</Button>}</div></>}</div>}</section>
}
