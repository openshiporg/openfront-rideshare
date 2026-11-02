import { sanitizeStoreLogoSvg } from '../utils/storeLogo'
import { normalizeStoreLogoColor } from '../../platform/settings/branding/store-logo'

/** Branding input for the save command: sanitize the SVG first, then normalize the hue.
 * `name` is optional so a logo-only command keeps the stored name. */
export function buildFleetBrandingInput(args: { logoIcon: string; logoColor: string; name?: string | null }) {
  const logoIcon = sanitizeStoreLogoSvg(args.logoIcon)
  if (!logoIcon) throw new Error('Branding input is invalid.')
  const logoColor = normalizeStoreLogoColor(args.logoColor)
  if (args.name === undefined || args.name === null) return { logoIcon, logoColor }
  const name = args.name.trim()
  if (!name || name.length > 120) throw new Error('Branding input is invalid.')
  return { logoIcon, logoColor, name }
}
