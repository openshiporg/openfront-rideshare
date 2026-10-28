'use client'

import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { formatMoney } from '@/features/lib/currency'
import { RiderButton, RiderTrack } from './RiderPills'

type CardPayment = { enabled: boolean; payable: boolean; status: string | null; amountMinor: number | null; currencyCode: string | null; url: string | null }
const FIELDS = 'enabled payable status amountMinor currencyCode url'

async function send<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/graphql', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(25_000), body: JSON.stringify({ query, variables }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.errors?.length || !payload?.data) throw new Error(payload?.errors?.[0]?.message || 'Request failed')
  return payload.data
}

/** Pay the quoted fare by card (Stripe Checkout) once a driver is assigned. Only the signed-in rider sees it. */
export function TripCardPayment({ tripId, status }: { tripId: string; status: string }) {
  const [payment, setPayment] = useState<CardPayment | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const checkout = new URLSearchParams(window.location.search).get('checkout')
      try {
        // Back from Stripe: settle the attempt from its Checkout session before showing the state.
        if (checkout && checkout.startsWith('cs_')) {
          const data = await send<{ confirmTripCardPayment: CardPayment }>(`mutation ConfirmCard($tripId: ID!) { confirmTripCardPayment(tripId: $tripId) { ${FIELDS} } }`, { tripId })
          if (active) setNotice(data.confirmTripCardPayment.status === 'captured' ? 'Payment received. Thanks for riding.' : 'Your payment is still processing. Refresh in a moment.')
        } else if (checkout === 'cancelled' && active) setNotice('Payment cancelled. You can pay whenever you’re ready.')
        const data = await send<{ tripCardPayment: CardPayment }>(`query TripCard($tripId: ID!) { tripCardPayment(tripId: $tripId) { ${FIELDS} } }`, { tripId })
        if (active) setPayment(data.tripCardPayment)
      } catch { if (active) setPayment(null) }
    }
    void load()
    return () => { active = false }
  }, [tripId, status])

  if (!payment?.enabled || (!payment.payable && payment.status !== 'captured')) return null
  const amount = payment.amountMinor != null && payment.currencyCode ? formatMoney(payment.amountMinor, payment.currencyCode) : null

  async function pay() {
    setBusy(true); setError('')
    try {
      const data = await send<{ startTripCardPayment: CardPayment }>(`mutation StartCard($tripId: ID!) { startTripCardPayment(tripId: $tripId) { ${FIELDS} } }`, { tripId })
      if (data.startTripCardPayment.url) { window.location.assign(data.startTripCardPayment.url); return }
      setPayment(data.startTripCardPayment)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Card payment couldn’t start.') }
    setBusy(false)
  }

  return <section aria-label="Fare payment" className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-border bg-kerb p-5">
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Fare</p>
      <p className="font-display text-2xl font-extrabold tabular-nums [font-stretch:115%]">{amount ?? '—'}</p>
      {payment.status === 'captured' ? <p className="text-sm text-signal">Paid by card</p> : <p className="text-sm text-muted-foreground">Pay securely by card</p>}
    </div>
    {payment.payable && payment.status !== 'captured' && <RiderTrack><RiderButton tone="signal" disabled={busy} onClick={() => void pay()}><CreditCard className="size-4" aria-hidden="true" />{busy ? 'Opening…' : 'Pay fare'}</RiderButton></RiderTrack>}
    {notice && <p role="status" className="w-full text-sm text-muted-foreground">{notice}</p>}
    {error && <p role="alert" className="w-full text-sm text-[#ff8a7f]">{error}</p>}
  </section>
}
