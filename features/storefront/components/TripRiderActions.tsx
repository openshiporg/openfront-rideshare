'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LifeBuoy, MessageCircle, ShieldAlert, Star } from 'lucide-react'
import { RiderButton, RiderButtonLink, RiderPill, RiderTrack } from './RiderPills'

type Panel = 'rate' | 'help' | 'safety' | 'message' | null
const ACTIVE = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress']

async function send(query: string, variables: Record<string, unknown>) {
  const response = await fetch('/api/graphql', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12_000), body: JSON.stringify({ query, variables }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.errors?.length || !payload?.data) throw new Error('Not sent')
  return payload.data
}

const field = 'w-full rounded-[6px] bg-asphalt px-4 py-3 text-base outline-none ring-1 ring-inset ring-white/10 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-signal'

/** Rate, get help, report a safety issue or message the driver. The server allows only the signed-in rider of this trip. */
export function TripRiderActions({ tripId, status }: { tripId: string; status: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    send('query RiderSession { authenticatedItem { ... on User { id } } }', {}).then(data => { if (active) setSignedIn(Boolean(data.authenticatedItem?.id)) }).catch(() => { if (active) setSignedIn(false) })
    return () => { active = false }
  }, [])
  if (signedIn === null) return null
  if (!signedIn) return <section aria-label="Trip help" className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-border bg-kerb p-5">
    <p className="text-sm text-muted-foreground">Sign in with the account you booked with to rate, message or get help.</p>
    <RiderButtonLink href="/account/signin" tone="raised">Sign in</RiderButtonLink>
  </section>
  const choices: Array<[Exclude<Panel, null>, string, typeof Star]> = [
    ...(status === 'completed' ? [['rate', 'Rate ride', Star] as [Exclude<Panel, null>, string, typeof Star]] : []),
    ...(ACTIVE.includes(status) ? [['message', 'Message driver', MessageCircle] as [Exclude<Panel, null>, string, typeof Star]] : []),
    ['help', 'Get help', LifeBuoy], ['safety', 'Safety issue', ShieldAlert],
  ]
  async function submit() {
    if (busy) return
    const key = `${panel}:${tripId}:${crypto.randomUUID()}`
    setBusy(true); setError('')
    try {
      if (panel === 'rate') {
        if (!rating) { setError('Choose a rating.'); return }
        await send('mutation Rate($tripId: ID!, $rating: Int!, $body: String, $key: String!) { submitTripReview(tripId: $tripId, rating: $rating, body: $body, idempotencyKey: $key) { id } }', { tripId, rating, body: text.trim() || null, key })
        setDone('Thanks for rating your ride.')
      } else if (panel === 'help') {
        if (!subject.trim() || !text.trim()) { setError('Add a subject and what happened.'); return }
        await send('mutation Help($tripId: ID!, $subject: String!, $description: String!, $key: String!) { openSupportCase(tripId: $tripId, category: "trip", subject: $subject, description: $description, idempotencyKey: $key) { id } }', { tripId, subject: subject.trim(), description: text.trim(), key })
        setDone('Help request sent. The fleet will follow up.')
      } else if (panel === 'safety') {
        if (!text.trim()) { setError('Describe what happened.'); return }
        await send('mutation Safety($tripId: ID!, $severity: String, $summary: String!, $key: String!) { reportSafetyIncident(tripId: $tripId, severity: $severity, category: "rider_report", summary: $summary, idempotencyKey: $key) { id } }', { tripId, severity, summary: text.trim().slice(0, 500), key })
        setDone('Safety report sent. In an emergency, call local emergency services.')
      } else if (panel === 'message') {
        if (!text.trim()) return
        await send('mutation Message($tripId: ID!, $body: String!, $key: String!) { sendTripMessage(tripId: $tripId, body: $body, idempotencyKey: $key) { id } }', { tripId, body: text.trim(), key })
        setDone('Message sent.')
      }
      setPanel(null); setText(''); setSubject(''); setRating(0)
    } catch { setError(panel === 'rate' ? 'Rating not sent. Each ride can be rated once.' : 'Not sent. Try again.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Trip help" className="space-y-4 rounded-[6px] border border-border bg-kerb p-5">
    <RiderTrack label="Trip actions" className="flex-wrap">{choices.map(([key, label, Icon]) => <RiderPill key={key} active={panel === key} onClick={() => { setPanel(panel === key ? null : key); setError(''); setDone('') }}><Icon className="size-4" aria-hidden="true" />{label}</RiderPill>)}</RiderTrack>
    {panel && <div className="space-y-3">
      {panel === 'rate' && <div role="radiogroup" aria-label="Rating" className="flex gap-1">{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)} className="grid size-11 place-items-center rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-signal"><Star className={`size-7 ${value <= rating ? 'fill-signal text-signal' : 'text-lane'}`} aria-hidden="true" /></button>)}</div>}
      {panel === 'help' && <label className="block space-y-1.5"><span className="text-sm font-medium">Subject</span><input value={subject} onChange={event => setSubject(event.target.value)} maxLength={160} className={field} /></label>}
      {panel === 'safety' && <RiderTrack label="Severity">{[['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Urgent']].map(([value, label]) => <RiderPill key={value} active={severity === value} onClick={() => setSeverity(value)}>{label}</RiderPill>)}</RiderTrack>}
      <label className="block space-y-1.5"><span className="text-sm font-medium">{panel === 'rate' ? 'Comment' : panel === 'message' ? 'Message' : 'What happened'}{panel === 'rate' && <span className="font-normal text-muted-foreground"> · optional</span>}</span><textarea value={text} onChange={event => setText(event.target.value)} rows={3} maxLength={panel === 'safety' ? 500 : 2000} className={field} /></label>
      <RiderButton tone={panel === 'safety' ? 'danger' : 'signal'} disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : panel === 'rate' ? 'Send rating' : panel === 'message' ? 'Send message' : 'Send'}</RiderButton>
    </div>}
    {done && <p role="status" className="text-sm text-signal">{done}</p>}
    {error && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}
    <p className="text-xs text-muted-foreground"><Link href="/account/rides" className="font-medium hover:text-foreground">My rides</Link></p>
  </section>
}
