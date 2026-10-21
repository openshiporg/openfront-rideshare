'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/features/lib/currency'
import { useDurableCommand } from '@/features/platform/components/durableCommand'

type Preview = { tripId: string; actorId: string; acceptedOfferId: string; updatedAt: string; feeMinor: number; currencyCode: string; refundRequired: string }
export function TripOperatorActions({ tripId, status, actionsEnabled, actorId = '', acceptedOfferId = '', driverMode = false }: { tripId: string; status: string; actionsEnabled: boolean; actorId?: string; acceptedOfferId?: string; driverMode?: boolean }) {
  const router = useRouter()
  const command = useDurableCommand(actorId, `trip:${tripId}`)
  const [dialog, setDialog] = useState(false)
  const [reassign, setReassign] = useState(false)
  const [reasonCode, setReasonCode] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reviewError, setReviewError] = useState('')
  const previewFlight = useRef(false)
  const transition = ({ driver_assigned: ['start_en_route','Start en route'], driver_en_route: ['arrive','Arrived'], driver_arrived: ['start_trip','Start trip'], in_progress: ['complete','Complete'] } as Record<string,[string,string]>)[status]
  const cancellable = !driverMode && ['driver_assigned','driver_en_route','driver_arrived'].includes(status)
  useEffect(() => { if (command.intent?.phase === 'resolved') { setDialog(false); router.refresh() } }, [command.intent?.key, command.intent?.phase, router])
  async function review(nextReassign: boolean) {
    if (previewFlight.current || command.pending) return
    previewFlight.current = true; setPreview(null); setReviewError(''); setReassign(nextReassign); setDialog(true)
    try {
      const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ query: `query CancellationReview($id: ID!) { tripCancellationPreview(tripId: $id) }`, variables: { id: tripId } }) })
      const payload = await response.json()
      const result = payload.data?.tripCancellationPreview
      if (!response.ok || payload.errors?.length || result?.tripId !== tripId || result.actorId !== actorId || result.acceptedOfferId !== acceptedOfferId || !Number.isSafeInteger(result.feeMinor) || result.feeMinor < 0 || typeof result.currencyCode !== 'string' || !Number.isFinite(Date.parse(result.updatedAt))) throw new Error()
      setPreview(result)
    } catch { setReviewError('Cancellation review is unavailable. Refresh the trip before trying again.') }
    finally { previewFlight.current = false }
  }
  function cancel() {
    if (!preview || !reasonCode || command.busy || command.pending) return
    void command.execute({ purpose: 'cancel', body: { tripId, reasonCode, reason: '', reassign, expectedAcceptedOfferId: preview.acceptedOfferId, expectedUpdatedAt: preview.updatedAt, expectedFeeMinor: preview.feeMinor, expectedCurrencyCode: preview.currencyCode } })
  }
  function progress(action: string) { void command.execute({ purpose: 'transition', body: { tripId, action, expectedAcceptedOfferId: acceptedOfferId } }) }
  const disabled = !command.ready || command.busy || command.pending || !actionsEnabled || !acceptedOfferId
  return <div className="mt-3 min-w-0 space-y-2" data-command-pending={command.pending || command.busy ? 'true' : undefined}>
    <div className="flex flex-wrap gap-2">{transition && <Button type="button" size="sm" disabled={disabled} onClick={() => progress(transition[0])}>{command.busy ? 'Saving…' : transition[1]}</Button>}{driverMode && status === 'driver_arrived' && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => progress('no_show')}>Report no-show</Button>}{cancellable && <><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void review(false)}>Cancel trip</Button><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void review(true)}>Cancel &amp; reassign</Button></>}{command.pending && <Button type="button" size="sm" variant="outline" disabled={command.busy || !command.ready} onClick={() => void command.execute()}>Recover original command</Button>}</div>
    {!actionsEnabled && <p role="status" className="text-xs text-muted-foreground">New trip commands are unavailable in this deployment.</p>}{command.intent?.phase === 'resolved' && <p role="status" className="text-xs text-muted-foreground">{command.intent.receipt}</p>}{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}
    <Dialog open={dialog} onOpenChange={open => { if (!command.busy) setDialog(open) }}><DialogContent data-unsaved={reasonCode ? 'true' : undefined}><DialogHeader><DialogTitle>{reassign ? 'Cancel and reassign trip' : 'Cancel trip'}</DialogTitle><DialogDescription>Review the accepted cancellation fee. Cancellation does not confirm a refund or a message to the rider.</DialogDescription></DialogHeader>{preview ? <p>Fee: {formatMoney(preview.feeMinor, preview.currencyCode)} · refund requires review.</p> : <p role="status">{reviewError || 'Loading cancellation review…'}</p>}<Label htmlFor={`cancel-reason-${tripId}`}>Reason</Label><select id={`cancel-reason-${tripId}`} value={reasonCode} disabled={command.busy || command.pending} onChange={event => setReasonCode(event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3"><option value="">Choose the actual reason</option><option value="rider_requested">Rider requested</option><option value="driver_unavailable">Driver unavailable</option><option value="vehicle_unavailable">Vehicle unavailable</option><option value="operations_change">Operations change</option><option value="other">Other</option></select><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={!preview || !reasonCode || disabled} onClick={cancel}>Confirm cancellation</Button><Button type="button" variant="outline" disabled={command.busy} onClick={() => setDialog(false)}>{command.pending ? 'Close review; retain original command' : 'Keep trip'}</Button>{command.pending && <Button type="button" variant="outline" disabled={command.busy} onClick={() => void command.execute()}>Recover original cancellation</Button>}</div>{command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}{command.pending && <p role="status" className="text-sm">Original cancellation is unresolved. It remains saved when this review closes.</p>}</DialogContent></Dialog>
  </div>
}
