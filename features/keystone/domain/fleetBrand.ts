import { sanitizeStoreLogoSvg } from '../utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '../../platform/settings/branding/store-logo'

export const fleetBrandSelect = { id: true, name: true, logoIcon: true, logoColor: true } as const
export function projectFleetBrand(fleet: any) {
  if (!fleet?.id || typeof fleet.name !== 'string') return null
  return { fleetId: fleet.id, name: fleet.name, logoIcon: sanitizeStoreLogoSvg(fleet.logoIcon || '') || DEFAULT_STORE_LOGO_ICON, logoColor: normalizeStoreLogoColor(fleet.logoColor) }
}
