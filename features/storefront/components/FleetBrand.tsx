import Link from 'next/link'
import { normalizeStoreLogoColor } from '@/features/platform/settings/branding/store-logo'

export type PublicFleetBrand = { fleetId?: string; name: string; logoIcon?: string; logoColor?: string }
/** Only the server's minimal sanitized public DTO is used here. SVG images are
 * image documents, never injected active HTML. */
export function FleetBrand({ fleet }: { fleet?: PublicFleetBrand | null }) {
  return <Link href="/" className="flex min-w-0 max-w-full items-center gap-2 font-semibold"><img alt="" className="size-9 shrink-0" src={fleet?.logoIcon ? `data:image/svg+xml,${encodeURIComponent(fleet.logoIcon)}` : '/favicon.svg'} style={fleet?.logoIcon ? { filter: `hue-rotate(${normalizeStoreLogoColor(fleet.logoColor)}deg)` } : undefined} /><span className="min-w-0 break-words">{fleet?.name || 'Openfront Rideshare'}</span></Link>
}
