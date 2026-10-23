import Link from 'next/link'
import { CircleUserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FleetBrand, type PublicFleetBrand } from './FleetBrand'

/** Storefront frame: brand, the two places a rider goes back to, and the staff entrance in the footer. */
export function RiderShell({ fleet, children, className }: { fleet?: PublicFleetBrand | null; children: React.ReactNode; className?: string }) {
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
