'use client'

import { useEffect, useState } from 'react'
import { gql } from '../lib/api'
import { Button, Icon, Spinner, cx } from './ui'

// The rider's card on file. Saving opens Stripe's own page (Checkout in setup mode) and comes back here;
// the app only ever sees the brand and last four.

export type SavedCard = { brand: string; last4: string; expMonth: number | null; expYear: number | null }
export const SAVED_CARD_FIELDS = 'brand last4 expMonth expYear'

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', jcb: 'JCB', diners: 'Diners', unionpay: 'UnionPay' }
export const cardName = (card: SavedCard) => `${BRANDS[card.brand] || 'Card'} •••• ${card.last4}`

export function useSavedCard(signedIn: boolean) {
  const [state, setState] = useState<{ enabled: boolean; card: SavedCard | null } | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!signedIn) { setState(null); return }
    let active = true
    gql<{ riderSavedCard: { enabled: boolean; card: SavedCard | null } }>(`query RiderCard { riderSavedCard { enabled card { ${SAVED_CARD_FIELDS} } } }`)
      .then(data => { if (active) setState(data.riderSavedCard) }).catch(() => { if (active) setState(null) })
    return () => { active = false }
  }, [signedIn, revision])
  return { ...state, loaded: state !== null, reload: () => setRevision(value => value + 1) }
}

/** Opens Stripe to save a card, returning to `returnTo` (a path in this app). */
export async function startCardSetup(returnTo: string) {
  const data = await gql<{ startRiderCardSetup: { url: string } }>('mutation CardSetup($returnTo: String) { startRiderCardSetup(returnTo: $returnTo) }', { returnTo }, { timeoutMs: 25_000 })
  if (!data.startRiderCardSetup?.url) throw new Error('Card setup couldn’t start.')
  window.location.assign(data.startRiderCardSetup.url)
}

/** On the way back from Stripe: saves the card and tidies the address bar. Returns what to tell the rider. */
export async function finishCardSetup(): Promise<{ saved: boolean; card: SavedCard | null; message: string } | null> {
  const params = new URLSearchParams(window.location.search)
  const value = params.get('card_setup')
  if (!value) return null
  params.delete('card_setup')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
  if (value === 'cancelled') return { saved: false, card: null, message: 'No card saved. You can add one any time.' }
  try {
    const data = await gql<{ confirmRiderCardSetup: { saved: boolean; card: SavedCard | null } }>(`mutation CardSaved($sessionId: String!) { confirmRiderCardSetup(sessionId: $sessionId) { saved card { ${SAVED_CARD_FIELDS} } } }`, { sessionId: value }, { timeoutMs: 25_000 })
    const result = data.confirmRiderCardSetup
    return { ...result, message: result.saved && result.card ? `${cardName(result.card)} saved. Your fares are charged to it after each ride.` : 'The card wasn’t saved. Try again.' }
  } catch { return { saved: false, card: null, message: 'The card wasn’t saved. Try again.' } }
}

/** A compact row: the card on file, or a button to add one. */
export function SavedCardRow({ card, returnTo, label = 'Add a card', className, onError }: { card: SavedCard | null | undefined; returnTo: string; label?: string; className?: string; onError?: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function add() {
    setBusy(true)
    try { await startCardSetup(returnTo) } catch (cause) { onError?.(cause instanceof Error ? cause.message : 'Card setup couldn’t start.'); setBusy(false) }
  }
  return <div className={cx('flex items-center justify-between gap-3 rounded-[16px] bg-white px-4 py-3 ring-1 ring-rule', className)}>
    <span className="flex min-w-0 items-center gap-2 text-[15px]"><Icon.card className="size-5 shrink-0" /><span className="truncate">{card ? cardName(card) : 'No card saved'}</span></span>
    <Button size="sm" tone={card ? 'secondary' : 'primary'} disabled={busy} onClick={() => void add()}>{busy ? <Spinner className="size-4" /> : card ? 'Change' : label}</Button>
  </div>
}
