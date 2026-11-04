'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { History, LoaderCircle, MapPin, Menu, Navigation, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FleetBrand, type PublicFleetBrand } from './FleetBrand'
import { RideMap, type LngLat, type MapPlace } from './RideMap'
import { MapSheet, type SheetSnap } from './MapSheet'

type ShellFleet = PublicFleetBrand & { publicCity?: string | null }
export type ShellMap = {
  pickup?: MapPlace | null
  dropoff?: MapPlace | null
  route?: LngLat[] | null
  corner?: React.ReactNode
  /** The phone sheet's detent, owned by the page so it can open the sheet for typing and lower it for a route. */
  snap: SheetSnap
  onSnap: (snap: SheetSnap) => void
  /** Called with the rider's position after they allow location. */
  onLocate?: (point: LngLat) => void
  onCityCentre?: (point: LngLat | null) => void
  sheetLabel?: string
}

const DESKTOP = '(min-width: 1024px)'

/** Storefront frame: brand, the rider's city, ride history and account, and the staff entrance.
 * With `map`, the page is a live city map with the rider's panel over it (a draggable sheet on
 * phones, a floating panel on desktop); without it, a plain light page. */
export function RiderShell({ fleet, children, className, map }: { fleet?: ShellFleet | null; children: React.ReactNode; className?: string; map?: ShellMap }) {
  const storeFleet = useStoreFleet(!fleet?.publicCity)
  const brand: ShellFleet | null = fleet || storeFleet
  const city = fleet?.publicCity || storeFleet?.publicCity || null
  const pathname = usePathname()
  const onRides = pathname === '/account/rides'
  const header = <header className="relative z-40 border-b border-border/80 bg-white/95 backdrop-blur-md max-lg:border-none max-lg:bg-transparent max-lg:backdrop-blur-none">
    <nav aria-label="Rider" className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.4rem] lg:px-10">
      <div className="pointer-events-auto min-w-0 flex-1"><FleetBrand fleet={brand} /></div>
      <div className={cn('pointer-events-auto flex shrink-0 items-center gap-2 sm:gap-3', map && 'max-lg:hidden')}>
        {city && <span className="hidden items-center gap-1.5 text-[0.9375rem] font-medium text-ink md:inline-flex"><MapPin className="size-4 text-signal" aria-hidden="true" />{city}</span>}
        {city && <span aria-hidden="true" className="hidden h-6 w-px bg-border md:block" />}
        <Link href="/account/rides" aria-current={onRides ? 'page' : undefined} className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-white/90 px-3.5 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-ink/10 transition-colors hover:text-foreground aria-[current=page]:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:shadow-none max-sm:w-10 max-sm:justify-center max-sm:px-0"><History className="size-[1.1rem] sm:hidden" aria-hidden="true" /><span className="max-sm:sr-only">My rides</span></Link>
        <Link href="/account" aria-label="Account" className="grid size-10 place-items-center rounded-full bg-white text-ink shadow-sm ring-1 ring-ink/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><UserRound className="size-[1.15rem]" aria-hidden="true" /></Link>
      </div>
    </nav>
  </header>

  if (map) return <MapFrame map={map} city={city} header={header} brand={brand} ridesCurrent={onRides} className={className}>{children}</MapFrame>

  return <div className="rs flex min-h-dvh flex-col bg-asphalt font-sans text-foreground [&_p]:break-words">
    <div className="sticky top-0 z-40 [&_header]:border-b [&_header]:border-border/80 [&_header]:bg-white/95 [&_header]:backdrop-blur-md">{header}</div>
    <main className={cn('mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-10', className)}>{children}</main>
    <Footer brand={brand} />
  </div>
}

function MapFrame({ map, city, header, brand, ridesCurrent, className, children }: { map: ShellMap; city: string | null; header: React.ReactNode; brand: ShellFleet | null; ridesCurrent: boolean; className?: string; children: React.ReactNode }) {
  const [desktop, setDesktop] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  const [panelWidth, setPanelWidth] = useState(460)
  const [user, setUser] = useState<LngLat | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  useEffect(() => {
    const query = window.matchMedia(DESKTOP)
    const update = () => { setDesktop(query.matches); setPanelWidth(Math.min(460, window.innerWidth - 80)) }
    update()
    query.addEventListener('change', update); window.addEventListener('resize', update)
    return () => { query.removeEventListener('change', update); window.removeEventListener('resize', update) }
  }, [])
  useEffect(() => { if (!locateError) return; const timer = window.setTimeout(() => setLocateError(''), 4000); return () => window.clearTimeout(timer) }, [locateError])

  const locate = () => {
    if (!('geolocation' in navigator)) { setLocateError('Location unavailable'); return }
    setLocating(true); setLocateError('')
    navigator.geolocation.getCurrentPosition(position => {
      const point: LngLat = [Math.round(position.coords.longitude * 1e5) / 1e5, Math.round(position.coords.latitude * 1e5) / 1e5]
      setUser(point); setLocating(false); map.onLocate?.(point)
    }, error => {
      setLocating(false)
      setLocateError(error.code === error.PERMISSION_DENIED ? 'Location blocked. Allow it in your browser settings.' : 'Location unavailable')
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 })
  }

  const insets = desktop ? { top: 70, right: 24, bottom: 24, left: panelWidth + 40 } : { top: 72, right: 16, bottom: sheetHeight, left: 16 }
  return <div className="rs relative h-dvh overflow-hidden bg-[#dceef5] font-sans text-foreground [&_p]:break-words">
    <RideMap city={city} pickup={map.pickup} dropoff={map.dropoff} route={map.route} user={user} insets={insets} follow={desktop || map.snap !== 'full'} onCentre={map.onCityCentre} className="absolute inset-0 lg:top-[4.4rem]" />
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 max-lg:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.9),rgba(255,255,255,0))] lg:pointer-events-auto">{header}</div>
    <PhoneMenu ridesCurrent={ridesCurrent} />
    <button type="button" onClick={locate} aria-label="Use my location" aria-busy={locating}
      style={desktop ? undefined : { bottom: `calc(${sheetHeight}px + 2rem)` }}
      className={cn('absolute right-4 z-30 grid size-12 place-items-center rounded-full bg-white text-signal shadow-[0_6px_20px_-8px_rgba(11,43,46,0.45)] transition-[bottom] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:bottom-10 lg:right-10 lg:size-14', map.snap === 'full' && 'max-lg:hidden')}>
      {locating ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Navigation className="size-5 fill-current" aria-hidden="true" />}
    </button>
    {locateError && <p role="alert" style={desktop ? undefined : { bottom: `calc(${sheetHeight}px + 5.75rem)` }} className="absolute right-4 z-30 max-w-[16rem] rounded-xl bg-white px-3 py-2 text-sm font-medium text-ink shadow-[0_6px_20px_-8px_rgba(11,43,46,0.45)] lg:bottom-28 lg:right-10">{locateError}</p>}
    {map.corner && <div className="pointer-events-none absolute bottom-10 z-20 hidden lg:block" style={{ left: panelWidth + 64 }}>{map.corner}</div>}
    <main className={cn('pointer-events-none absolute inset-0 z-30', className)}>
      <MapSheet snap={map.snap} onSnap={map.onSnap} onHeight={setSheetHeight} label={map.sheetLabel || 'Ride'}>
        {children}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pb-2 pt-4 text-xs text-muted-foreground">
          <FleetBrand fleet={brand} size="sm" />
          <Link href="/dashboard" className="font-medium hover:text-foreground">Drivers &amp; operators</Link>
        </div>
      </MapSheet>
    </main>
  </div>
}

function Footer({ brand }: { brand: ShellFleet | null }) {
  return <footer className="border-t border-border bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-10">
      <FleetBrand fleet={brand} size="sm" />
      <Link href="/dashboard" className="font-medium hover:text-foreground">Drivers &amp; operators</Link>
    </div>
  </footer>
}

/** Phone only: the map keeps the top clear, so My rides and Account sit behind one menu button. */
function PhoneMenu({ ridesCurrent }: { ridesCurrent: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  const item = 'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium text-ink hover:bg-foam focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return <div className="absolute left-4 top-[4.25rem] z-50 lg:hidden">
    <button type="button" aria-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="rider-menu" onClick={() => setOpen(value => !value)} className="grid size-12 place-items-center rounded-full bg-white text-ink shadow-[0_6px_20px_-8px_rgba(11,43,46,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}</button>
    {open && <nav id="rider-menu" aria-label="Menu" className="mt-2 w-56 rounded-2xl bg-white p-1.5 shadow-[0_18px_50px_-18px_rgba(11,43,46,0.5)] ring-1 ring-ink/5">
      <Link href="/account/rides" aria-current={ridesCurrent ? 'page' : undefined} className={item} onClick={() => setOpen(false)}><History className="size-[1.1rem] text-signal" aria-hidden="true" />My rides</Link>
      <Link href="/account" className={item} onClick={() => setOpen(false)}><UserRound className="size-[1.1rem] text-signal" aria-hidden="true" />Account</Link>
    </nav>}
  </div>
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
