import Link from 'next/link'
import { normalizeStoreLogoColor } from '@/features/platform/settings/branding/store-logo'
import { storeOwnMark } from '../lib/store-mark'

export type PublicFleetBrand = { fleetId?: string; name: string; logoIcon?: string; logoColor?: string }
/** Only the server's minimal sanitized public DTO is used here. SVG images are
 * image documents, never injected active HTML. The mark shows only when the
 * fleet picked its own in Store Settings; otherwise the name is the wordmark. */
export function FleetBrand({ fleet }: { fleet?: PublicFleetBrand | null }) {
  const mark = storeOwnMark(fleet?.logoIcon)
  return <Link href="/" className="flex min-w-0 max-w-full items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {mark && <img alt="" className="size-8 shrink-0 object-contain lg:size-10" src={`data:image/svg+xml,${encodeURIComponent(mark)}`} style={{ filter: `hue-rotate(${normalizeStoreLogoColor(fleet?.logoColor)}deg)` }} />}
    <span className="min-w-0 text-balance text-[1.0625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[1.25rem] lg:text-[1.75rem]">{fleet?.name || 'Rideshare'}</span>
  </Link>
}
