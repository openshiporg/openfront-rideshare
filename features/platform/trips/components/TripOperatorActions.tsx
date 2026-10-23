'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { OperationsOffNotice } from '@/features/platform/components/OperationsOffNotice'
import { formatMoney } from '@/features/lib/currency'
import { useDurableCommand } from '@/features/platform/components/durableCommand'

type Preview = { tripId: string; actorId: string; acceptedOfferId: string; updatedAt: string; feeMinor: number; currencyCode: string; refundRequired: string }
export function TripOperatorActions({ tripId, status, actionsEnabled, actorId = '', acceptedOfferId = '', driverMode = false, operationsOff = false }: { tripId: string; status: string; actionsEnabled: boolean; actorId?: string; acceptedOfferId?: string; driverMode?: boolean; operationsOff?: boolean }) {
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
    } catch { setReviewError('Fee unavailable. Refresh the trip.') }
    finally { previewFlight.current = false }
  }
  function cancel() {
    if (!preview || !reasonCode || command.busy || command.pending) return
    void command.execute({ purpose: 'cancel', body: { tripId, reasonCode, reason: '', reassign, expectedAcceptedOfferId: preview.acceptedOfferId, expectedUpdatedAt: preview.updatedAt, expectedFeeMinor: preview.feeMinor, expectedCurrencyCode: preview.currencyCode } })
  }
  function progress(action: string) { void command.execute({ purpose: 'transition', body: { tripId, action, expectedAcceptedOfferId: acceptedOfferId } }) }
  const disabled = !command.ready || command.busy || command.pending || !actionsEnabled || !acceptedOfferId
  if (!transition && !cancellable && !command.pending && !(driverMode && status === 'driver_arrived') && command.intent?.phase !== 'resolved' && !command.error) return null
  return <div className="min-w-0 space-y-2" data-command-pending={command.pending || command.busy ? 'true' : undefined}>
    {actionsEnabled || command.pending ? <ActionTrack label="Trip actions">
      {transition && <TrackButton tone="primary" size={driverMode ? 'lg' : 'md'} disabled={disabled} onClick={() => progress(transition[0])}>{command.busy ? 'Saving…' : transition[1]}</TrackButton>}
      {driverMode && status === 'driver_arrived' && <TrackButton size={driverMode ? 'lg' : 'md'} disabled={disabled} onClick={() => progress('no_show')}>No-show</TrackButton>}
      {cancellable && <><TrackButton size="md" disabled={disabled} onClick={() => void review(true)}>Cancel &amp; reassign</TrackButton><TrackButton tone="danger" size="md" disabled={disabled} onClick={() => void review(false)}>Cancel trip</TrackButton></>}
      {command.pending && <TrackButton tone="primary" size="md" disabled={command.busy || !command.ready} onClick={() => void command.execute()}>Recover last command</TrackButton>}
    </ActionTrack> : operationsOff ? <OperationsOffNotice /> : <p role="status" className="inline-flex rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">Reload to update this trip</p>}
    {command.intent?.phase === 'resolved' && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{command.intent.receipt}</p>}{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}
    <Dialog open={dialog} onOpenChange={open => { if (!command.busy) setDialog(open) }}><DialogContent data-unsaved={reasonCode ? 'true' : undefined}><DialogHeader><DialogTitle>{reassign ? 'Cancel and reassign trip' : 'Cancel trip'}</DialogTitle><DialogDescription>{preview ? `Cancellation fee ${formatMoney(preview.feeMinor, preview.currencyCode)}` : reviewError || 'Loading fee…'}</DialogDescription></DialogHeader><Label htmlFor={`cancel-reason-${tripId}`}>Reason</Label><select id={`cancel-reason-${tripId}`} value={reasonCode} disabled={command.busy || command.pending} onChange={event => setReasonCode(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border bg-background px-3"><option value="">Choose a reason</option><option value="rider_requested">Rider requested</option><option value="driver_unavailable">Driver unavailable</option><option value="vehicle_unavailable">Vehicle unavailable</option><option value="operations_change">Operations change</option><option value="other">Other</option></select><ActionTrack className="w-full justify-end"><TrackButton size="md" disabled={command.busy} onClick={() => setDialog(false)}>{command.pending ? 'Close' : 'Keep trip'}</TrackButton>{command.pending ? <TrackButton tone="primary" size="md" disabled={command.busy} onClick={() => void command.execute()}>Recover cancellation</TrackButton> : <TrackButton tone="danger" size="md" disabled={!preview || !reasonCode || disabled} onClick={cancel}>Confirm cancellation</TrackButton>}</ActionTrack>{command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}{command.pending && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Cancellation unconfirmed</p>}</DialogContent></Dialog>
  </div>
}
