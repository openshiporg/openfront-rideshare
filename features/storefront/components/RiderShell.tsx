'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, MapPin, Navigation, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FleetBrand, type PublicFleetBrand } from './FleetBrand'
import { HarborMap } from './HarborMap'

type ShellFleet = PublicFleetBrand & { publicCity?: string | null; heroImageUrl?: string | null }
type MapProps = { variant?: 'home' | 'route'; areas?: string[]; pickupLabel?: string | null; dropoffLabel?: string | null; corner?: React.ReactNode }

/** Storefront frame: brand, the rider's city, ride history and account, and the staff entrance in the footer.
 * With `map`, the page floats its panel over a full-bleed city map (the rider app); without it, a plain light page. */
export function RiderShell({ fleet, children, className, map }: { fleet?: ShellFleet | null; children: React.ReactNode; className?: string; map?: MapProps }) {
  const storeFleet = useStoreFleet(!fleet)
  const brand: ShellFleet | null = fleet || storeFleet
  const pathname = usePathname()
  const onRides = pathname === '/account/rides'
  const header = <header className="relative z-40 border-b border-border/80 bg-white/95 backdrop-blur-md max-lg:border-none max-lg:bg-transparent max-lg:backdrop-blur-none">
    <nav aria-label="Rider" className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.4rem] lg:px-10">
      <div className="min-w-0 flex-1"><FleetBrand fleet={brand} /></div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {brand?.publicCity && <span className="hidden items-center gap-1.5 text-[0.9375rem] font-medium text-ink md:inline-flex"><MapPin className="size-4 text-signal" aria-hidden="true" />{brand.publicCity}</span>}
        {brand?.publicCity && <span aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />}
        <Link href="/account/rides" aria-current={onRides ? 'page' : undefined} className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-white/90 px-3.5 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-ink/10 transition-colors hover:text-foreground aria-[current=page]:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:shadow-none max-sm:w-10 max-sm:justify-center max-sm:px-0"><History className="size-[1.1rem] sm:hidden" aria-hidden="true" /><span className="max-sm:sr-only">My rides</span></Link>
        <Link href="/account" aria-label="Account" className="grid size-10 place-items-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><UserRound className="size-[1.15rem]" aria-hidden="true" /></Link>
      </div>
    </nav>
  </header>

  if (map) return <div className="rs flex min-h-dvh flex-col bg-asphalt font-sans text-foreground [&_p]:break-words">
    <div className="relative flex min-h-dvh flex-col lg:h-dvh lg:min-h-[44rem]">
      {map.variant !== 'route' && brand?.heroImageUrl
        ? <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[17rem] overflow-hidden sm:h-[22rem] lg:bottom-0 lg:h-full"><img src={brand.heroImageUrl} alt="" className="size-full object-cover" /><span className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.35),rgba(255,255,255,0)_30%)] lg:bg-[linear-gradient(to_right,rgba(11,43,46,0.18),rgba(11,43,46,0)_45%)]" /></div>
        : <HarborMap variant={map.variant} city={brand?.publicCity} areas={map.areas} pickupLabel={map.pickupLabel} dropoffLabel={map.dropoffLabel} className="absolute inset-x-0 top-0 h-[17rem] overflow-hidden sm:h-[22rem] lg:bottom-0 lg:h-full" />}
      <div className="relative max-lg:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.92),rgba(255,255,255,0))]">{header}</div>
      <main className={cn('relative z-10 flex-1 max-lg:mt-[10.5rem] max-lg:rounded-t-[1.75rem] max-lg:bg-white max-lg:px-4 max-lg:pb-8 max-lg:pt-3 max-lg:shadow-[0_-12px_40px_-24px_rgba(11,43,46,0.5)] sm:max-lg:mt-[15rem] sm:max-lg:px-6 lg:overflow-y-auto lg:px-10 lg:pb-10 lg:pt-6', className)}>
        <span aria-hidden="true" className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[#c9d3d4] lg:hidden" />
        {children}
      </main>
      <span aria-hidden="true" className="absolute right-4 top-[4.6rem] z-20 grid size-12 place-items-center rounded-full bg-white text-signal shadow-[0_6px_20px_-8px_rgba(11,43,46,0.45)] lg:bottom-10 lg:right-10 lg:top-auto lg:size-14"><Navigation className="size-5 fill-current" /></span>
      {map.corner && <div className="pointer-events-none absolute bottom-10 left-[31.5rem] z-20 hidden lg:block">{map.corner}</div>}
    </div>
    <Footer name={brand?.name} />
  </div>

  return <div className="rs flex min-h-dvh flex-col bg-asphalt font-sans text-foreground [&_p]:break-words">
    <div className="sticky top-0 z-40 [&_header]:border-b [&_header]:border-border/80 [&_header]:bg-white/95 [&_header]:backdrop-blur-md">{header}</div>
    <main className={cn('mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10', className)}>{children}</main>
    <Footer name={brand?.name} />
  </div>
}

function Footer({ name }: { name?: string }) {
  return <footer className="border-t border-border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-10">
      <span>{name || 'Rideshare'}</span>
      <Link href="/dashboard" className="font-medium hover:text-foreground">Drivers &amp; operators</Link>
    </div>
  </footer>
}

const brandCacheKey = 'openfront-rideshare-store-brand-v2'

/** The store's own fleet brand, for pages that aren't about one service (account, ride history, trip status). */
function useStoreFleet(enabled: boolean) {
  const [brand, setBrand] = useState<ShellFleet | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    try { const cached = sessionStorage.getItem(brandCacheKey); if (cached) setBrand(JSON.parse(cached)) } catch { /* the request below still fills it */ }
    fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ query: 'query StoreBrand { marketplaceRideshareServices(limit: 1) { fleet { name publicCity logoIcon logoColor } } }' }) })
      .then(response => response.json())
      .then(payload => {
        const value = payload?.data?.marketplaceRideshareServices?.[0]?.fleet
        if (!active || typeof value?.name !== 'string') return
        const next = { name: value.name, publicCity: typeof value.publicCity === 'string' ? value.publicCity : null, logoIcon: typeof value.logoIcon === 'string' ? value.logoIcon : undefined, logoColor: typeof value.logoColor === 'string' ? value.logoColor : undefined }
        setBrand(next)
        try { sessionStorage.setItem(brandCacheKey, JSON.stringify(next)) } catch { /* optional */ }
      })
      .catch(() => { /* the default mark stays */ })
    return () => { active = false }
  }, [enabled])
  return brand
}
