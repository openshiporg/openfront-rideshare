'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleUserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FleetBrand, type PublicFleetBrand } from './FleetBrand'

/** Storefront frame: brand, the two places a rider goes back to, and the staff entrance in the footer. */
export function RiderShell({ fleet, children, className }: { fleet?: PublicFleetBrand | null; children: React.ReactNode; className?: string }) {
  const storeFleet = useStoreFleet(!fleet)
  fleet = fleet || storeFleet
  return <div className="rs dark flex min-h-dvh flex-col bg-asphalt font-sans text-foreground [&_p]:break-words">
    <header className="sticky top-0 z-40 border-b border-border/70 bg-asphalt/85 backdrop-blur-md">
      <nav aria-label="Rider" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <FleetBrand fleet={fleet} />
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-kerb p-1 ring-1 ring-inset ring-white/5">
          <Link href="/account/rides" className="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">My rides</Link>
          <Link href="/account" aria-label="Account" className="grid size-9 place-items-center rounded-full bg-lane text-foreground shadow-sm ring-1 ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CircleUserRound className="size-[1.125rem]" aria-hidden="true" /></Link>
        </div>
      </nav>
    </header>
    <main className={cn('mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10', className)}>{children}</main>
    <footer className="border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <span>{fleet?.name || 'Rideshare'}</span>
        <Link href="/dashboard" className="font-medium hover:text-foreground">Drivers &amp; operators</Link>
      </div>
    </footer>
  </div>
}

const brandCacheKey = 'openfront-rideshare-store-brand-v1'

/** The store's own fleet brand, for pages that aren't about one service (account, ride history, trip status). */
function useStoreFleet(enabled: boolean) {
  const [brand, setBrand] = useState<PublicFleetBrand | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    try { const cached = sessionStorage.getItem(brandCacheKey); if (cached) setBrand(JSON.parse(cached)) } catch { /* the request below still fills it */ }
    fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ query: 'query StoreBrand { marketplaceRideshareServices(limit: 1) { fleet { name logoIcon logoColor } } }' }) })
      .then(response => response.json())
      .then(payload => {
        const value = payload?.data?.marketplaceRideshareServices?.[0]?.fleet
        if (!active || typeof value?.name !== 'string') return
        const next = { name: value.name, logoIcon: typeof value.logoIcon === 'string' ? value.logoIcon : undefined, logoColor: typeof value.logoColor === 'string' ? value.logoColor : undefined }
        setBrand(next)
        try { sessionStorage.setItem(brandCacheKey, JSON.stringify(next)) } catch { /* optional */ }
      })
      .catch(() => { /* the default mark stays */ })
    return () => { active = false }
  }, [enabled])
  return brand
}
