import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STORE_LOGO_ICON } from '../features/platform/settings/branding/store-logo'
import { storeOwnMark } from '../features/storefront/lib/store-mark'

test('no saved mark means wordmark only', () => {
  assert.equal(storeOwnMark(null), '')
  assert.equal(storeOwnMark(undefined), '')
  assert.equal(storeOwnMark('   '), '')
})

test('the platform placeholder saved by onboarding is not the fleet mark', () => {
  assert.equal(storeOwnMark(DEFAULT_STORE_LOGO_ICON), '')
  assert.equal(storeOwnMark(`  ${DEFAULT_STORE_LOGO_ICON}\n`), '')
})

test('a mark set in Store Settings still shows', () => {
  const car = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0b4a4a" d="M3 13l2-5h14l2 5v5H3z"/></svg>'
  const out = storeOwnMark(car)
  assert.match(out, /^<svg/)
  assert.match(out, /M3 13l2-5h14l2 5v5H3z/)
})
