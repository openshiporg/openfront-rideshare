'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { gql, REQUEST_FIELDS, whoAmI, type RequestView } from '../lib/api'
import { dayAndTime, shortPlace } from '../lib/format'
import { rideStage, type RideStage } from '../domain/riderFlow'
import { parseRiderReceipt, receiptStorageKey, riderStatusHref, type RiderReceipt } from '../domain/riderReceiptStorage'
import { RiderPage } from '../components/RiderPage'
import { ButtonLink, Button, Icon, Spinner } from '../components/ui'

const WORDS: Record<RideStage, string> = { finding: 'Finding a driver', reassigning: 'Finding a driver', scheduled: 'Scheduled', assigned: 'Driver on the way', arrived: 'Driver arrived', onTrip: 'On trip', completed: 'Completed', cancelled: 'Cancelled', noDriver: 'No driver found', unknown: 'Update' }

/** Uber's Activity: upcoming and past rides, newest first. */
export default function RiderRides() {
  const [items, setItems] = useState<RequestView[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [guest, setGuest] = useState<RiderReceipt | null>(null)
  useEffect(() => { try { setGuest(parseRiderReceipt(sessionStorage.getItem(receiptStorageKey))) } catch { /* none */ } }, [])
  useEffect(() => {
    let active = true
    setFailed(false)
    void (async () => {
      const who = await whoAmI().catch(() => null)
      if (!active) return
      setSignedIn(Boolean(who))
      if (!who) { setItems([]); return }
      try {
        const data = await gql<{ myRideshareRequests: { items: RequestView[]; nextCursor: string | null } }>(`query MyRides($cursor: ID) { myRideshareRequests(cursor: $cursor) { nextCursor items { ${REQUEST_FIELDS} } } }`, { cursor })
        if (!active) return
        setItems(current => cursor && current ? [...current, ...data.myRideshareRequests.items] : data.myRideshareRequests.items)
        setNext(data.myRideshareRequests.nextCursor)
      } catch { if (active) { setFailed(true); setItems(current => current || []) } }
    })()
    return () => { active = false }
  }, [cursor])

  const stageOf = (item: RequestView) => rideStage(item.status, item.trip?.status, item.handoffState, item.requestedFor)
  const upcoming = (items || []).filter(item => ['finding', 'reassigning', 'scheduled', 'assigned', 'arrived', 'onTrip'].includes(stageOf(item)))
  const past = (items || []).filter(item => !upcoming.includes(item))

  return <RiderPage title="My rides">
    {guest && <Link href="/" className="mb-6 flex min-h-14 items-center justify-between gap-3 rounded-[18px] bg-tide px-4 text-white">
      <span className="min-w-0 truncate text-[16px] font-semibold">Current ride · <span className="font-mono font-normal">{guest.requestNumber}</span></span><Icon.chevronRight className="size-4 shrink-0" />
    </Link>}
    {items === null || signedIn === null ? <p className="flex items-center gap-3 text-[16px]"><Spinner />Loading rides…</p>
      : !signedIn ? <div className="space-y-4">
        <p className="text-[16px] text-ink-2">Sign in to see every ride you’ve booked, with live status and receipts.</p>
        <div className="grid grid-cols-2 gap-2"><ButtonLink href="/account/signin">Sign in</ButtonLink><ButtonLink href="/" tone="secondary">Book a ride</ButtonLink></div>
      </div>
      : <>
        {failed && <div role="alert" className="mb-4 flex items-center justify-between gap-3"><p className="text-[15px] text-alert">Rides couldn’t load.</p><Button size="sm" tone="secondary" onClick={() => setCursor(c => c)}>Try again</Button></div>}
        {!items.length && !failed && <div className="space-y-4 py-6 text-center"><p className="text-[17px] font-semibold">No rides yet</p><ButtonLink href="/">Book a ride</ButtonLink></div>}
        {upcoming.length > 0 && <Section title="Upcoming" items={upcoming} stageOf={stageOf} />}
        {past.length > 0 && <Section title="Past" items={past} stageOf={stageOf} />}
        {next && <Button tone="secondary" className="mt-4 w-full" onClick={() => setCursor(next)}>Older rides</Button>}
      </>}
  </RiderPage>
}

function Section({ title, items, stageOf }: { title: string; items: RequestView[]; stageOf: (item: RequestView) => RideStage }) {
  return <section className="mb-6" aria-label={title}>
    <h2 className="mb-1 text-[20px] font-bold">{title}</h2>
    <ul className="divide-y divide-rule">
      {items.map(item => {
        const href = item.trip ? riderStatusHref(item.trip.confirmationCode, item.requestId) : null
        const body = <>
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-tide-soft text-tide"><Icon.pin className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold">{shortPlace(item.dropoffLabel) || 'Ride'}</span>
            <span className="block truncate text-[14px] text-ink-2">{dayAndTime(item.requestedFor || item.createdAt)} · {WORDS[stageOf(item)]}</span>
          </span>
          {href && <Icon.chevronRight className="size-4 shrink-0 text-ink-3" />}
        </>
        return <li key={item.requestId}>{href ? <Link href={href} className="flex min-h-[72px] items-center gap-4 py-2">{body}</Link> : <div className="flex min-h-[72px] items-center gap-4 py-2">{body}</div>}</li>
      })}
    </ul>
  </section>
}
