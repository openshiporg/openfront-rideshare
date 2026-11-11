// Review r6 proof: load every staff page as each role and print only PASS/FAIL per page.
// Usage: CRAWL_BASE=https://your-host CRAWL_LOGINS=/path/to/logins.json node scripts/r6-crawl.mjs [roles...]
// CRAWL_LOGINS is a JSON file { "<role>": { "email": "...", "password": "..." } } kept outside the repo.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'

const BASE = process.env.CRAWL_BASE
const people = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)
const OUT = process.env.CRAWL_OUT

async function gql(query, cookie) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query }) })
  return r.json()
}
async function token(who) {
  const p = people[who]
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', variables: { e: p.email, p: p.password } }) })
  return (await r.json()).data?.authenticateUserWithPassword?.sessionToken
}

const own = await token(people.owner ? 'owner' : Object.keys(people)[0])
const cookie = 'keystonejs-session=' + own
const dr = await gql(`{trips(take:1){id confirmationCode} drivers:driverProfiles(take:1){id} rideRequests(take:1){id requestNumber}}`, cookie)
if (!dr.data) { console.log('CHECK crawl id lookup: FAIL (' + JSON.stringify(dr.errors?.[0]?.message) + ')'); process.exit(1) }
const d = dr.data
const sections = ['dispatch', 'trips', 'drivers', 'vehicles', 'services', 'finance', 'safety', 'reviews', 'team', 'settings', 'my-driving']
const extra = { trip: d.trips[0] && 'trips/' + d.trips[0].id, driver: d.drivers[0] && 'drivers/' + d.drivers[0].id, nopeTrip: 'trips/nope123', nopeDriver: 'drivers/nope123' }
const NOPE = new Set(['trips/nope123', 'drivers/nope123'])
const paths = [...sections, ...Object.values(extra).filter(Boolean)]

const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const res = {}
let bad = 0
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin')
  await p.fill('input[name=email]', people[role].email)
  await p.fill('input[name=password]', people[role].password)
  await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')])
  for (const path of paths) {
    const r = await p.goto(BASE + '/dashboard/platform/' + path, { waitUntil: 'load', timeout: 90000 }).catch(() => null)
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const broken = /could not be found|this page could not be loaded|something went wrong|application error|QUERY_TOO_BROAD|too broad/i.test(txt)
    const expect404 = NOPE.has(path)
    const ok = expect404 ? http === 404 : http === 200 && !broken
    res[`${role} ${path}`] = { http, broken, expect404 }
    if (!ok) bad++
    const name = Object.entries(extra).find(([, v]) => v === path)?.[0] ?? path
    console.log(`CHECK ${role} ${name}: ${ok ? 'PASS' : 'FAIL'} (${http}${expect404 ? ' expected 404' : ''})`)
  }
  await ctx.close()
}
await b.close()
if (OUT) fs.writeFileSync(OUT + '.json', JSON.stringify(res, null, 1))
console.log(`CHECK all staff pages: ${bad ? 'FAIL' : 'PASS'} (${Object.keys(res).length} loads, ${bad} failed)`)
