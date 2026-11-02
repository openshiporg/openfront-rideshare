import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', 'features', 'storefront')
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : []
})

test('customer storefront pages use no native select, date or time controls', () => {
  const banned = /<select\b|type=(?:"|'|\{\s*['"`])(?:date|time|datetime-local|month|week)\b/
  const offenders = files(root).filter(file => banned.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

test('rider storefront and trip stage rail keep text at or above 12px', () => {
  const small = /text-\[(?:0\.[0-6]\d*|0\.7[01]\d*|1[01]px|[0-9]px)(?:rem)?\]/
  const targets = [...files(root), join(__dirname, '..', 'features', 'platform', 'components', 'TripStageRail.tsx')]
  const offenders = targets.filter(file => small.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})
