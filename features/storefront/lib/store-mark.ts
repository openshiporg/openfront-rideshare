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
