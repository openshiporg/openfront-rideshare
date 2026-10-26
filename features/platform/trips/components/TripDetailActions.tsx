'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { SetupSheet, TransitionTrack } from '@/features/platform/components/SetupSheet'
import { ops } from '@/features/platform/setup/setupMutations'

export function RecordPaymentTrack({ tripId }: { tripId: string }) {
  return <TransitionTrack label="Payment" actions={[{ label: 'Record charge', tone: 'primary', run: () => ops.recordPayment(tripId) }]} />
}

export function ConfirmPaymentTrack({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="space-y-1.5">
    <ActionTrack label="Mark paid">
      <label className="sr-only" htmlFor={`method-${paymentId}`}>Paid by</label>
      <select id={`method-${paymentId}`} value={method} onChange={event => setMethod(event.target.value)} className="h-8 rounded-[4px] bg-background px-3 text-sm ring-1 ring-foreground/10">
        <option value="cash">Cash</option><option value="card_terminal">Card terminal</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option>
      </select>
      <TrackButton tone="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await ops.confirmPayment(paymentId, method); router.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Did not save.') } finally { setBusy(false) } }}>{busy ? 'Saving…' : 'Mark paid'}</TrackButton>
    </ActionTrack>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

export function RefundSheet({ paymentId, currency, remainingMinor }: { paymentId: string; currency: string; remainingMinor: number }) {
  return <SetupSheet trigger="Refund" tone="default" title="Refund" submitLabel="Record refund" onSubmit={values => {
    if (!values.amountMinor || values.amountMinor > remainingMinor) throw new Error(`Refund between 0.01 and ${(remainingMinor / 100).toFixed(2)} ${currency}.`)
    return ops.refund(paymentId, values.amountMinor, values.reason)
  }} fields={[
    { name: 'amountMinor', label: 'Amount', type: 'money', currency, required: true, defaultValue: remainingMinor },
    { name: 'reason', label: 'Reason', type: 'text', maxLength: 500 },
  ]} />
}

export function ConfirmRefundTrack({ refundId }: { refundId: string }) {
  return <TransitionTrack label="Refund" actions={[{ label: 'Mark refunded', tone: 'primary', run: () => ops.confirmRefund(refundId) }]} />
}

export function MessageComposer({ tripId }: { tripId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="space-y-2" data-unsaved={body ? 'true' : undefined} onSubmit={async event => {
    event.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true); setError('')
    try { await ops.message(tripId, body.trim()); setBody(''); router.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message not sent.') } finally { setBusy(false) }
  }}>
    <label className="sr-only" htmlFor={`message-${tripId}`}>Message</label>
    <textarea id={`message-${tripId}`} value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={2} placeholder="Message rider and driver" className="w-full rounded-[6px] border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    <div className="flex justify-end"><ActionTrack><TrackButton type="submit" tone="primary" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send'}</TrackButton></ActionTrack></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </form>
}
