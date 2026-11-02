import { sanitizeStoreLogoSvg } from '../../keystone/utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON } from '../../platform/settings/branding/store-logo'

/** The storefront mark, shown beside the fleet name in the header and the footer: the saved icon,
 * or this repo's default icon when none is saved or the saved one is unsafe. Never hidden. */
export function storeLogoMark(logoIcon: string | null | undefined): string {
  return sanitizeStoreLogoSvg((logoIcon || '').trim()) || sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON) || ''
}

/** A short header wordmark from the store name: its first word ("Harbor" for
 * "Harbor Independent Mobility"); short leading words like "The" keep the next one. */
export function storeWordmark(name: string | null | undefined): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'Rideshare'
  if (words.length > 1 && words[0].length <= 3) return `${words[0]} ${words[1]}`
  return words[0]
}
