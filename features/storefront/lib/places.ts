import { useSyncExternalStore } from 'react'
import type { LngLat, Place } from './api'

/** Open map data (Photon via /api/places, OSRM via /api/route). No keys, no fake places. */

const cache = new Map<string, Place[]>()
const isPlace = (value: any): value is Place => typeof value?.label === 'string' && typeof value?.name === 'string' && Array.isArray(value?.point) && value.point.length === 2 && value.point.every(Number.isFinite)

export async function searchPlaces(query: string, near: LngLat | null, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const key = `${q.toLowerCase()}|${near?.map(n => n.toFixed(2)).join(',') || ''}`
  if (cache.has(key)) return cache.get(key)!
  const response = await fetch(`/api/places?q=${encodeURIComponent(q)}${near ? `&near=${near.join(',')}` : ''}`, { signal })
  if (!response.ok) throw new Error('Search unavailable')
  const places = ((await response.json())?.places || []).filter(isPlace).map(({ label, name, detail, point }: Place) => ({ label, name, detail: detail || '', point }))
  cache.set(key, places)
  return places
}

/** The address at a point (the rider's GPS fix or a dropped pin). */
export async function placeAt(point: LngLat, signal?: AbortSignal): Promise<Place | null> {
  const response = await fetch(`/api/places?at=${point.join(',')}`, { signal }).catch(() => null)
  if (!response?.ok) return null
  const found = (await response.json())?.places?.[0]
  return isPlace(found) ? { label: found.label, name: found.name, detail: found.detail || '', point } : null
}

/** The fleet's city centre, used when the rider has not shared a location. */
const areas = new Map<string, Promise<LngLat | null>>()
export function cityPoint(city: string | null | undefined): Promise<LngLat | null> {
  const name = city?.trim()
  if (!name) return Promise.resolve(null)
  if (!areas.has(name)) areas.set(name, fetch(`/api/places?area=${encodeURIComponent(name)}`).then(r => r.ok ? r.json() : null).then(body => {
    const point = body?.places?.[0]?.point
    return Array.isArray(point) && point.length === 2 ? point as LngLat : null
  }).catch(() => null))
  return areas.get(name)!
}

export type RoutePath = { coordinates: LngLat[]; distanceMeters: number; durationSeconds: number }
export async function drivingRoute(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<RoutePath | null> {
  const response = await fetch(`/api/route?from=${from.join(',')}&to=${to.join(',')}`, { signal }).catch(() => null)
  if (!response?.ok) return null
  const path = await response.json().catch(() => null)
  return Array.isArray(path?.coordinates) && path.coordinates.length >= 2 ? path : null
}

/** Places this device chose before, newest first (labels and points only). */
const RECENT_KEY = 'openfront-rideshare-recent-places-v2'
export function recentPlaces(): Place[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(value) ? value.filter(isPlace).slice(0, 8) : []
  } catch { return [] }
}
export function rememberPlace(place: Place) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([place, ...recentPlaces().filter(p => p.label !== place.label)].slice(0, 8))) } catch { /* optional */ }
  recentListeners.forEach(listener => listener())
}

// Recent places for rendering. The server (and the first client render) has none, so the page
// hydrates identically; the device's list appears right after (React #418 otherwise).
const recentListeners = new Set<() => void>()
let recentCache: { raw: string | null; places: Place[] } = { raw: null, places: [] }
const NO_PLACES: Place[] = []
function recentSnapshot(): Place[] {
  let raw: string | null = null
  try { raw = localStorage.getItem(RECENT_KEY) } catch { return NO_PLACES }
  if (raw !== recentCache.raw) recentCache = { raw, places: recentPlaces() }
  return recentCache.places
}
function subscribeRecent(listener: () => void) {
  recentListeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === RECENT_KEY) listener() }
  window.addEventListener('storage', onStorage)
  return () => { recentListeners.delete(listener); window.removeEventListener('storage', onStorage) }
}
export function useRecentPlaces(): Place[] {
  return useSyncExternalStore(subscribeRecent, recentSnapshot, () => NO_PLACES)
}

/** The rider's position, once, if they allow it. */
export function locate(timeoutMs = 8000): Promise<LngLat | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(
    fix => resolve([Math.round(fix.coords.longitude * 1e5) / 1e5, Math.round(fix.coords.latitude * 1e5) / 1e5]),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
  ))
}

export function milesBetween(a: LngLat, b: LngLat) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}
