'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { gql, type Fleet, type Identity } from '../lib/api'
import { initials } from '../lib/format'
import { storeLogoMark, storeWordmark } from '../lib/store-mark'
import { Icon, cx, useDismiss } from './ui'

const LINKS = [
  { href: '/', label: 'Ride' },
  { href: '/account/rides', label: 'My rides' },
  { href: '/dashboard', label: 'Drivers & operators' },
]

/**
 * The header bar on every rider screen: the fleet's mark and name at the left, the rider's links and
 * account at the right. One bar for the map screen and the account pages, so the brand never floats alone.
 */
export function RiderHeader({ identity, fleet, className }: { identity: Identity | undefined; fleet: Fleet | null | undefined; className?: string }) {
  const pathname = usePathname() || '/'
  const active = (href: string) => href === '/' ? pathname === '/' || pathname === '/book' || pathname.startsWith('/rides/') : pathname.startsWith(href)
  return <header className={cx('rider-header z-30 h-14 border-b border-rule bg-white lg:h-16', className)}>
    <div className="flex h-full items-center gap-3 pl-4 pr-2 pt-[env(safe-area-inset-top)] lg:gap-8 lg:px-6">
      <Link href="/" aria-label={fleet?.name || 'Home'} className="press -ml-1 flex h-11 min-w-0 items-center gap-2.5 rounded-[12px] px-1 outline-none focus-visible:ring-2 focus-visible:ring-tide">
        {fleet !== undefined ? <>
          <img alt="" src={`data:image/svg+xml,${encodeURIComponent(storeLogoMark(fleet?.logoIcon))}`} style={{ filter: `hue-rotate(${Number(fleet?.logoColor) || 0}deg)` }} className="h-7 w-6 shrink-0 object-contain" />
          <span className="display truncate text-[21px] font-bold leading-none tracking-[-0.03em]">{storeWordmark(fleet?.name)}</span>
        </> : <span aria-hidden="true" className="block h-6 w-28 rounded-md bg-rule/60" />}
      </Link>
      <nav aria-label="Rider" className="hidden h-full items-stretch gap-1 lg:flex">
        {LINKS.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? 'page' : undefined}
          className={cx('relative flex items-center px-3 text-[15px] font-semibold outline-none transition-colors focus-visible:text-tide', active(link.href) ? 'text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-tide' : 'text-ink-2 hover:text-ink')}>{link.label}</Link>)}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {identity !== undefined && !(identity === null && pathname.startsWith('/account/sign')) && <Link href={identity ? '/account' : '/account/signin'} className={cx('press hidden h-10 items-center gap-2 rounded-full text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 lg:flex', identity ? 'bg-paper pl-1.5 pr-4 ring-1 ring-inset ring-rule hover:bg-tide-soft' : 'bg-ink px-5 text-white hover:bg-tide-deep')}>
          {identity ? <><span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-tide text-[12px] font-bold text-white">{initials(identity.name) || <Icon.person className="size-4" />}</span><span className="max-w-40 truncate">{identity.name.split(/\s+/)[0]}</span></> : 'Sign in'}
        </Link>}
        <MobileMenu identity={identity ?? null} fleetName={fleet?.name || ''} />
      </div>
    </div>
  </header>
}

/** On phones the links fold into one menu: who you are, then Rides, Account, and the way in for drivers and fleet staff. */
function MobileMenu({ identity, fleetName }: { identity: Identity; fleetName: string }) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), panel)
  return <div className="relative lg:hidden" ref={panel}>
    <button type="button" aria-label="Menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)} className="press grid size-11 place-items-center rounded-full text-ink outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-tide">{open ? <Icon.close className="size-[22px]" /> : <Icon.menu className="size-[22px]" />}</button>
    {open && <div role="menu" className="pop-in absolute right-1 top-[50px] z-50 w-[min(19rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-[20px] bg-white py-2 shadow-[0_16px_48px_-12px_rgba(16,35,31,0.4)] ring-1 ring-rule">
      <div className="flex items-center gap-3 px-4 pb-3 pt-2">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-tide text-[15px] font-bold text-white">{identity ? initials(identity.name) : <Icon.person className="size-6" />}</span>
        <span className="min-w-0"><span className="block truncate text-[16px] font-semibold">{identity?.name || 'Guest'}</span><span className="block truncate text-[13px] text-ink-3">{identity?.email || (fleetName ? `Riding with ${fleetName}` : 'Not signed in')}</span></span>
      </div>
      <div className="border-t border-rule pt-1">
        <Item href="/">Book a ride</Item>
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

/** The fleet's name and mark for screens that don't load the ride list (account pages). Kept for the tab, so the header doesn't blink between pages. */
const FLEET_KEY = 'openfront-rideshare-fleet-v1'
export function rememberFleet(fleet: Fleet | null) {
  try { if (fleet) sessionStorage.setItem(FLEET_KEY, JSON.stringify(fleet)) } catch { /* optional */ }
}
export function useFleet(): Fleet | null | undefined {
  const [fleet, setFleet] = useState<Fleet | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    try {
      const kept = JSON.parse(sessionStorage.getItem(FLEET_KEY) || 'null')
      if (typeof kept?.name === 'string') setFleet(kept)
    } catch { /* fetched below */ }
    gql<{ marketplaceRideshareServices: Array<{ fleet: Fleet | null }> }>('query RiderFleet { marketplaceRideshareServices(limit: 12) { fleet { name publicCity logoIcon logoColor } } }')
      .then(data => { if (!active) return; const found = data.marketplaceRideshareServices?.find(service => service.fleet)?.fleet || null; setFleet(found); rememberFleet(found) })
      .catch(() => { if (active) setFleet(current => current ?? null) })
    return () => { active = false }
  }, [])
  return fleet
}
