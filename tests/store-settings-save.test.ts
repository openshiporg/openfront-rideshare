import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOGO_ICONS } from '../features/platform/settings/branding/icon-registry'
import { DEFAULT_STORE_LOGO_ICON } from '../features/platform/settings/branding/store-logo'
import { buildFleetBrandingInput } from '../features/keystone/domain/fleetBrandingInput'
import { storeLogoMark } from '../features/storefront/lib/store-mark'

test('a preset icon and hue go into the command unchanged', () => {
  assert.deepEqual(buildFleetBrandingInput({ logoIcon: LOGO_ICONS[3].lightSvg, logoColor: '120' }), { logoIcon: LOGO_ICONS[3].lightSvg, logoColor: '120' })
})

test('every preset survives the sanitizer', () => {
  for (const icon of LOGO_ICONS) assert.ok(buildFleetBrandingInput({ logoIcon: icon.lightSvg, logoColor: '0' }).logoIcon, icon.id)
})

test('a custom SVG is kept and trimmed', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#0b4a4a" d="M3 13l2-5h14l2 5v5H3z"/></svg>'
  assert.equal(buildFleetBrandingInput({ logoIcon: `\n${svg}  `, logoColor: '0' }).logoIcon, svg)
})

test('the hue is normalized to 0-359', () => {
  assert.equal(buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: '-90' }).logoColor, '270')
  assert.equal(buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: '400' }).logoColor, '40')
  assert.equal(buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: 'red' }).logoColor, '314')
})

test('an unsafe SVG rejects the save', () => {
  assert.throws(() => buildFleetBrandingInput({ logoIcon: '<svg onload="alert(1)"></svg>', logoColor: '0' }), /invalid/)
  assert.throws(() => buildFleetBrandingInput({ logoIcon: '', logoColor: '0' }), /invalid/)
})

test('the fleet name is optional, trimmed and required when sent', () => {
  assert.equal('name' in buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: '0' }), false)
  assert.equal(buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: '0', name: '  Harbor Cab ' }).name, 'Harbor Cab')
  assert.throws(() => buildFleetBrandingInput({ logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: '0', name: '  ' }), /invalid/)
})

test('the action composes sanitize, normalize, mutation inside the reviewed-version command', () => {
  const src = readFileSync(new URL('../features/keystone/mutations/fleetBranding.ts', import.meta.url), 'utf8')
  const save = src.slice(src.indexOf('export async function saveFleetBranding'))
  const order = ['buildFleetBrandingInput(args)', 'updateMany', 'fleetBrandingChange.create'].map(token => save.indexOf(token))
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2])
  assert.match(save, /updatedAt: new Date\(reviewedAt\)/)
  const input = readFileSync(new URL('../features/keystone/domain/fleetBrandingInput.ts', import.meta.url), 'utf8')
  assert.ok(input.indexOf('sanitizeStoreLogoSvg(args.logoIcon)') < input.indexOf('normalizeStoreLogoColor(args.logoColor)'))
})

test('the storefront always renders an icon: the saved one, else the default', () => {
  assert.match(storeLogoMark(null), /^<svg/)
  assert.match(storeLogoMark(''), /^<svg/)
  assert.match(storeLogoMark(DEFAULT_STORE_LOGO_ICON), /^<svg/)
  assert.match(storeLogoMark('<svg onload="x()"></svg>'), /^<svg/)
  assert.match(storeLogoMark(LOGO_ICONS[5].lightSvg), /^<svg/)
})
