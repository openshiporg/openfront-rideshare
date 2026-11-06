import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STORE_LOGO_ICON } from '../features/platform/settings/branding/store-logo'

test('the header shows the platform mark until the fleet picks its own', async () => {
  const { storeLogoMark } = await import('../features/storefront/lib/store-mark')
  assert.match(storeLogoMark(null), /^<svg/)
  assert.match(storeLogoMark(DEFAULT_STORE_LOGO_ICON), /^<svg/)
})

test('the wordmark is a short form of the store name', async () => {
  const { storeWordmark } = await import('../features/storefront/lib/store-mark')
  assert.equal(storeWordmark('Harbor Independent Mobility'), 'Harbor')
  assert.equal(storeWordmark('The Harbor Cab Co'), 'The Harbor')
  assert.equal(storeWordmark('Lyft'), 'Lyft')
  assert.equal(storeWordmark('  '), 'Rideshare')
})

test('the default mark is an Untitled UI logo from the picker, in teal', async () => {
  const { LOGO_ICONS } = await import('../features/platform/settings/branding/icon-registry')
  const { DEFAULT_STORE_LOGO_COLOR } = await import('../features/platform/settings/branding/store-logo')
  const { sanitizeStoreLogoSvg } = await import('../features/keystone/utils/storeLogo')
  const match = LOGO_ICONS.find(icon => icon.lightSvg.trim() === DEFAULT_STORE_LOGO_ICON)
  assert.equal(match?.id, 'luminous')
  assert.equal(DEFAULT_STORE_LOGO_COLOR, '314')
  assert.ok(sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON))
})
