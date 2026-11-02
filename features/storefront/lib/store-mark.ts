import { sanitizeStoreLogoSvg } from '../../keystone/utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON } from '../../platform/settings/branding/store-logo'

/**
 * The mark the fleet chose in Store Settings, sanitized, or "" for none.
 * An empty value, or the platform placeholder that onboarding saves when no mark
 * was picked, means the storefront shows the wordmark only.
 */
export function storeOwnMark(logoIcon: string | null | undefined): string {
  const raw = (logoIcon || '').trim()
  if (!raw || raw === DEFAULT_STORE_LOGO_ICON.trim()) return ''
  const svg = sanitizeStoreLogoSvg(raw)
  return svg && svg !== sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON) ? svg : ''
}

/** The header mark: the fleet's own, else the platform mark, as E-commerce does. */
export function storeLogoMark(logoIcon: string | null | undefined): string {
  return storeOwnMark(logoIcon) || sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON) || ''
}

/** A short header wordmark from the store name: its first word ("Harbor" for
 * "Harbor Independent Mobility"); short leading words like "The" keep the next one. */
export function storeWordmark(name: string | null | undefined): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'Rideshare'
  if (words.length > 1 && words[0].length <= 3) return `${words[0]} ${words[1]}`
  return words[0]
}
