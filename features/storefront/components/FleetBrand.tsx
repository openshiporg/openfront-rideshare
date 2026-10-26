import Link from 'next/link'
import { normalizeStoreLogoColor } from '@/features/platform/settings/branding/store-logo'
import { DEFAULT_RIDER_MARK } from './brandMark'

export type PublicFleetBrand = { fleetId?: string; name: string; logoIcon?: string; logoColor?: string }
/** Only the server's minimal sanitized public DTO is used here. SVG images are
 * image documents, never injected active HTML. */
export function FleetBrand({ fleet }: { fleet?: PublicFleetBrand | null }) {
  return <Link href="/" className="flex min-w-0 max-w-full items-center gap-2.5 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <img alt="" className="h-8 w-7 shrink-0 object-contain" src={`data:image/svg+xml,${encodeURIComponent(fleet?.logoIcon || DEFAULT_RIDER_MARK)}`} style={fleet?.logoIcon ? { filter: `hue-rotate(${normalizeStoreLogoColor(fleet.logoColor)}deg)` } : undefined} />
    <span className="min-w-0 truncate font-display text-[1.05rem] font-bold tracking-tight [font-stretch:118%]">{fleet?.name || 'Rideshare'}</span>
  </Link>
}
