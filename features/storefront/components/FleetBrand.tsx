import Link from 'next/link'
import { normalizeStoreLogoColor } from '@/features/platform/settings/branding/store-logo'
import { storeLogoMark, storeWordmark } from '../lib/store-mark'

export type PublicFleetBrand = { fleetId?: string; name: string; logoIcon?: string; logoColor?: string }
/** Store Settings logo, as the E-commerce storefront shows it: the saved mark
 * (the default icon until the fleet picks one) tinted by the saved hue, beside a
 * short wordmark. The full store name stays the link's accessible name. SVG marks
 * are image documents, never injected active HTML. */
export function FleetBrand({ fleet, size = 'md' }: { fleet?: PublicFleetBrand | null; size?: 'md' | 'sm' | 'chip' }) {
  const name = fleet?.name || 'Rideshare'
  const mark = storeLogoMark(fleet?.logoIcon)
  return <Link href="/" aria-label={name} title={name} className="flex min-w-0 max-w-full items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring lg:gap-2.5">
    <img alt="" className={size === 'sm' ? 'size-6 shrink-0 object-contain' : size === 'chip' ? 'size-6 shrink-0 object-contain lg:size-9' : 'size-8 shrink-0 object-contain lg:size-9'} src={`data:image/svg+xml,${encodeURIComponent(mark)}`} style={{ filter: `hue-rotate(${normalizeStoreLogoColor(fleet?.logoColor)}deg)` }} />
    {size === 'sm'
      ? <span className="min-w-0 truncate text-xs font-medium">{name}</span>
      : <span aria-hidden="true" className={`min-w-0 truncate font-semibold leading-none tracking-[-0.03em] text-ink lg:text-[1.75rem] ${size === 'chip' ? 'text-[20px] tracking-[-0.02em]' : 'text-[1.625rem]'}`}>{storeWordmark(name)}</span>}
  </Link>
}
