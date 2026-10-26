'use client'

import { useEffect, useRef, useState } from 'react'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { StatusDot } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'

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
  return <section className="space-y-3" aria-live="polite" aria-label="Trip history">
    <ActionTrack>
      <TrackButton tone="quiet" disabled={loading} onClick={() => void refresh()}>{loading ? 'Loading…' : checked ? 'Reload history' : 'History'}</TrackButton>
      {handoff?.available && cursor && <TrackButton tone="quiet" disabled={loading} onClick={() => void refresh()}>Latest</TrackButton>}
      {handoff?.available && handoff.nextCursor && <TrackButton tone="quiet" disabled={loading} onClick={() => void refresh(handoff.nextCursor)}>Older</TrackButton>}
    </ActionTrack>
    {error ? <p role="alert" className="text-xs text-destructive">History unavailable. Try again.</p>
      : checked && !loading && !handoff ? <p role="status" className="text-xs text-amber-700 dark:text-amber-300">History unavailable for your fleet access</p>
      : handoff && <div className="space-y-2 rounded-[6px] border bg-muted/30 p-3 text-xs">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground"><span>As of {observedAt}</span>{handoff.available && <span>Request <span className="font-mono text-foreground">{handoff.requestNumber}</span> · {statusLabel(handoff.requestStatus)}</span>}</p>
        {!handoff.available ? <p className="text-amber-700 dark:text-amber-300">Assignment details unavailable; needs reconciliation</p> : <ol className="space-y-1.5">{handoff.events.map((event, index) => { const state = event.toStatus || event.eventType; return <li key={`${event.eventType}:${event.occurredAt}:${index}`} className="flex items-center gap-2"><StatusDot tone={statusTone(state)} /><span className="font-medium">{statusLabel(state)}</span><span className="ml-auto tabular-nums text-muted-foreground">{formatWhen(event.occurredAt)}</span></li> })}</ol>}
        {handoff.available && handoff.historyTruncated && <p className="text-muted-foreground">Older events available</p>}
      </div>}
  </section>
}
