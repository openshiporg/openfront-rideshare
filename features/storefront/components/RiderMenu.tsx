'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { Identity } from '../lib/api'
import { Icon, MapButton, useDismiss } from './ui'

/** Uber's account menu: who you are, then Rides, Account, and the way in for drivers and fleet staff. */
export function RiderMenu({ identity, fleetName }: { identity: Identity; fleetName: string }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), panel)
  return <div className="relative" ref={panel}>
    <MapButton aria-label="Menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}>{open ? <Icon.close className="size-5" /> : <Icon.menu className="size-5" />}</MapButton>
    {open && <div role="menu" className="pop-in absolute right-0 top-[52px] z-50 w-[min(18rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl bg-white py-2 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-2">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-tide-soft text-tide"><Icon.person className="size-6" /></span>
        <span className="min-w-0"><span className="block truncate text-[16px] font-semibold">{identity?.name || 'Guest'}</span><span className="block truncate text-[13px] text-ink-3">{identity?.email || `Riding with ${fleetName}`}</span></span>
      </div>
      <div className="border-t border-rule pt-1">
        <Item href="/account/rides">My rides</Item>
        <Item href="/account">{identity ? 'Account' : 'Sign in'}</Item>
        <Item href="/dashboard">Drivers &amp; operators</Item>
      </div>
    </div>}
  </div>
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link role="menuitem" href={href} className="flex min-h-12 items-center justify-between px-4 text-[16px] font-medium outline-none hover:bg-tide-soft focus-visible:bg-tide-soft">{children}<Icon.chevronRight className="size-4 text-ink-3" /></Link>
}
