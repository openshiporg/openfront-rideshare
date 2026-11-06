/**
 * Open map services, called only from this server (never from riders' browsers), within their public
 * usage policies:
 * - Photon (komoot) for search-as-you-type and reverse lookups. Nominatim forbids autocomplete, so it is not used.
 * - OSRM (FOSSGIS demo) for driving routes: at most one request per second, non-commercial volume.
 * Both identify this app with a User-Agent, cache answers, and can be pointed at a fleet's own
 * instance with PHOTON_URL / OSRM_URL without a code change.
 */

export type LngLat = [number, number]
export type Place = { label: string; name: string; detail: string; point: LngLat; kind: string }
export type RoutedPath = { distanceMeters: number; durationSeconds: number; coordinates: LngLat[]; provider: 'osrm' | 'straight-line' }

import { formatPlace } from './address'

const USER_AGENT = 'openfront-rideshare/1.0 (+https://github.com/openshiporg/openfront-rideshare)'
const photonBase = () => (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/+$/, '')
const osrmBase = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/+$/, '')

/** A small LRU with expiry, per server instance. */
function cache<T>(max: number, ttlMs: number) {
  const entries = new Map<string, { at: number; value: T }>()
  return {
    get(key: string) {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (Date.now() - hit.at > ttlMs) { entries.delete(key); return undefined }
      entries.delete(key); entries.set(key, hit)
      return hit.value
    },
    set(key: string, value: T) {
      entries.set(key, { at: Date.now(), value })
      while (entries.size > max) entries.delete(entries.keys().next().value as string)
    },
  }
}

/** Spaces upstream calls at least `intervalMs` apart; callers past `maxWaitMs` of queue are refused. */
function gate(intervalMs: number, maxWaitMs: number) {
  let next = 0
  return async () => {
    const now = Date.now()
    const at = Math.max(now, next)
    if (at - now > maxWaitMs) return false
    next = at + intervalMs
    if (at > now) await new Promise(resolve => setTimeout(resolve, at - now))
    return true
  }
}

const placeCache = cache<Place[]>(500, 10 * 60_000)
const routeCache = cache<RoutedPath>(500, 30 * 60_000)
const photonGate = gate(350, 2_500)
const osrmGate = gate(1_000, 2_500)

/** Too many searches queued for the open service right now; the rider's next keystroke asks again. */
export class PlacesBusy extends Error {}

export function validPoint(value: unknown): LngLat | null {
  const pair = Array.isArray(value) ? value : value && typeof value === 'object' ? [(value as any).lon ?? (value as any).lng, (value as any).lat] : null
  if (!pair || pair.length !== 2) return null
  const [lon, lat] = pair.map(Number)
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null
  return [round(lon), round(lat)]
}

const round = (value: number, digits = 5) => Math.round(value * 10 ** digits) / 10 ** digits

function placeFrom(feature: any, typed?: string): Place | null {
  const point = validPoint(feature?.geometry?.coordinates)
  const p = feature?.properties || {}
  if (!point) return null
  const formatted = formatPlace(p, typed)
  return formatted ? { ...formatted, point, kind: String(p.osm_value || p.type || '') } : null
}

async function photon(path: string, params: URLSearchParams, typed?: string) {
  const key = `${path}?${params}`
  const cached = placeCache.get(key)
  if (cached) return cached
  if (!(await photonGate())) throw new PlacesBusy()
  try {
    const response = await fetch(`${photonBase()}${path}?${params}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return []
    const payload = await response.json()
    const seen = new Set<string>()
    const places = (Array.isArray(payload?.features) ? payload.features : []).map((feature: any) => placeFrom(feature, typed)).filter((place: Place | null): place is Place => {
      if (!place || seen.has(place.label)) return false
      seen.add(place.label); return true
    })
    placeCache.set(key, places)
    return places
  } catch { return [] as Place[] }
}

/** Places matching what the rider typed, nearest to `near` first; `within` (degrees) keeps results around it. */
export async function searchPlaces(query: string, near?: LngLat | null, options: { limit?: number; within?: number; kind?: 'place' | 'area' } = {}) {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 120)
  if (q.length < 2) return []
  const params = new URLSearchParams({ q, limit: String(Math.min(Math.max(options.limit || 6, 1), 8)), lang: 'en' })
  if (near) {
    params.set('lon', String(round(near[0], 3))); params.set('lat', String(round(near[1], 3)))
    params.set('zoom', '12'); params.set('location_bias_scale', '0.3')
    if (options.within) params.set('bbox', [near[0] - options.within, near[1] - options.within, near[0] + options.within, near[1] + options.within].map(value => round(value, 3)).join(','))
  }
  if (options.kind === 'area') for (const layer of ['city', 'district', 'locality']) params.append('layer', layer)
  return photon('/api/', params, q)
}

/** The address at a point: the nearest house number within ~40 m, else the street or place there. */
export async function reversePlace(point: LngLat) {
  const base = { lon: String(round(point[0], 5)), lat: String(round(point[1], 5)), lang: 'en' }
  const houses = await photon('/reverse', new URLSearchParams({ ...base, limit: '3', layer: 'house', radius: '0.04' }))
  const house = houses.find((place: Place) => /(^|, )\d+[a-z]? /i.test(place.label)) || null
  if (house) return house
  return (await photon('/reverse', new URLSearchParams({ ...base, lon: String(round(point[0], 4)), lat: String(round(point[1], 4)), limit: '1' })))[0] || null
}

const EARTH_RADIUS_METERS = 6_371_000
export function straightLine(from: LngLat, to: LngLat): RoutedPath {
  const rad = (degrees: number) => degrees * Math.PI / 180
  const dLat = rad(to[1] - from[1]); const dLon = rad(to[0] - from[0])
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from[1])) * Math.cos(rad(to[1])) * Math.sin(dLon / 2) ** 2
  const meters = 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a))
  // Streets are rarely straight: about 1.35x the crow-fly distance, at a city average of 28 km/h.
  const distanceMeters = Math.round(meters * 1.35)
  return { distanceMeters, durationSeconds: Math.round(distanceMeters / (28_000 / 3600)), coordinates: [from, to], provider: 'straight-line' }
}

/** The driving route between two points; a straight line when the router is busy or unreachable. */
export async function routeBetween(from: LngLat, to: LngLat): Promise<RoutedPath> {
  const key = `${from.join(',')};${to.join(',')}`
  const cached = routeCache.get(key)
  if (cached) return cached
  if (from[0] === to[0] && from[1] === to[1]) return straightLine(from, to)
  if (await osrmGate()) {
    try {
      const response = await fetch(`${osrmBase()}/route/v1/driving/${key}?overview=full&geometries=geojson&alternatives=false&steps=false`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6_000) })
      const payload = response.ok ? await response.json() : null
      const route = payload?.code === 'Ok' ? payload.routes?.[0] : null
      const coordinates = Array.isArray(route?.geometry?.coordinates) ? route.geometry.coordinates.map(validPoint).filter(Boolean) as LngLat[] : []
      if (route && route.distance > 0 && coordinates.length >= 2) {
        // Long lines are thinned so the payload stays small; the shape is kept.
        const step = Math.max(1, Math.ceil(coordinates.length / 1500))
        const thinned = coordinates.filter((_, index) => index % step === 0 || index === coordinates.length - 1)
        const routed: RoutedPath = { distanceMeters: Math.round(route.distance), durationSeconds: Math.round(route.duration), coordinates: thinned, provider: 'osrm' }
        routeCache.set(key, routed)
        return routed
      }
    } catch { /* the straight line below */ }
  }
  return straightLine(from, to)
}
