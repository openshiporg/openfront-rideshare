'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export type LngLat = [number, number]
export type MapPlace = { label?: string | null; point?: LngLat | null }
export type MapInsets = { top: number; right: number; bottom: number; left: number }
export type RoutePath = { coordinates: LngLat[]; distanceMeters: number; durationSeconds: number; provider: string }

// OpenFreeMap: open vector tiles, no key, OpenStreetMap data (attribution stays on the map).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const EMPTY_VIEW = { center: [-98.5, 39.5] as LngLat, zoom: 3 }

/** Positron, recoloured to the storefront's harbour palette: blue water, green parks, white streets. */
function tint(map: MapLibreMap) {
  const paint: Array<[string, string, unknown]> = [
    ['background', 'background-color', '#eef1ee'],
    ['water', 'fill-color', '#b4dcef'],
    ['waterway', 'line-color', '#a3d2e8'],
    ['park', 'fill-color', '#d4ead0'],
    ['landcover_wood', 'fill-color', '#d9ecd4'],
    ['landuse_residential', 'fill-color', '#eceeea'],
    ['building', 'fill-color', '#e4e7e3'],
    ['highway_minor', 'line-color', '#ffffff'],
    ['highway_major_inner', 'line-color', '#ffffff'],
    ['highway_major_casing', 'line-color', '#d5ddda'],
    ['highway_motorway_inner', 'line-color', '#f6e7b0'],
    ['highway_motorway_casing', 'line-color', '#e3d39b'],
    ['highway_motorway_bridge_inner', 'line-color', '#f6e7b0'],
    ['water_name_point_label', 'text-color', '#3f7f9c'],
    ['water_name_line_label', 'text-color', '#3f7f9c'],
    ['label_city', 'text-color', '#163a3e'],
    ['label_town', 'text-color', '#163a3e'],
    ['label_village', 'text-color', '#2a4f53'],
    ['label_other', 'text-color', '#56696b'],
  ]
  for (const [layer, property, value] of paint) {
    try { if (map.getLayer(layer)) map.setPaintProperty(layer, property, value) } catch { /* that layer keeps its colour */ }
  }
}

const centres = new Map<string, Promise<LngLat | null>>()
/** The fleet's city on the map (looked up once per page load). */
export function cityCentre(city: string | null | undefined) {
  const name = city?.trim()
  if (!name) return Promise.resolve(null)
  if (!centres.has(name)) centres.set(name, (async () => {
    try {
      const cached = sessionStorage.getItem(`rs-city:${name}`)
      if (cached) return JSON.parse(cached) as LngLat
    } catch { /* look it up */ }
    const response = await fetch(`/api/places?area=${encodeURIComponent(name)}`).catch(() => null)
    const point = response?.ok ? (await response.json())?.places?.[0]?.point as LngLat | undefined : undefined
    if (point) try { sessionStorage.setItem(`rs-city:${name}`, JSON.stringify(point)) } catch { /* optional */ }
    return point || null
  })())
  return centres.get(name)!
}

/** The best match for a typed place near the fleet's city, for places chosen by name only. */
export async function placePoint(label: string, near: LngLat | null, signal?: AbortSignal) {
  const response = await fetch(`/api/places?q=${encodeURIComponent(label)}${near ? `&near=${near.join(',')}` : ''}`, { signal }).catch(() => null)
  if (!response?.ok) return null
  return ((await response.json())?.places?.[0]?.point as LngLat | undefined) || null
}

/** The driving line between two points, from this store's routing proxy. */
export async function fetchRoute(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<RoutePath | null> {
  const response = await fetch(`/api/route?from=${from.join(',')}&to=${to.join(',')}`, { signal }).catch(() => null)
  if (!response?.ok) return null
  const path = await response.json()
  return Array.isArray(path?.coordinates) && path.coordinates.length >= 2 ? path : null
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function pinElement(kind: 'pickup' | 'dropoff' | 'user', label?: string | null) {
  const element = document.createElement('div')
  element.setAttribute('aria-hidden', 'true')
  if (kind === 'user') {
    element.className = 'ride-map-user'
    element.innerHTML = '<span></span>'
  } else if (kind === 'pickup') {
    element.className = 'ride-map-pickup'
    element.innerHTML = '<span></span>'
  } else {
    element.className = 'ride-map-dropoff'
    element.innerHTML = `${label ? `<b>${label.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)}</b>` : ''}<svg viewBox="0 0 26 34" width="30" height="39"><path d="M13 0C5.8 0 0 5.6 0 12.6 0 22 13 34 13 34S26 22 26 12.6C26 5.6 20.2 0 13 0Z" fill="#0b4a4a"/><circle cx="13" cy="12.5" r="5" fill="#fff"/></svg>`
  }
  return element
}

/**
 * The rider's live map: real streets (MapLibre + OpenFreeMap), one-finger pan and pinch zoom, the
 * pickup and destination pins, and the route line between them. `insets` is the part of the map
 * the page covers (the phone sheet, the desktop panel), so pins are always framed in the open area.
 */
export function RideMap({ city, pickup, dropoff, route, user, insets, follow = true, onCentre, className = '' }: {
  city?: string | null
  pickup?: MapPlace | null
  dropoff?: MapPlace | null
  route?: LngLat[] | null
  user?: LngLat | null
  insets: MapInsets
  /** Reframe when the covered area changes (off while the rider's sheet is at full height). */
  follow?: boolean
  onCentre?: (centre: LngLat | null) => void
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markers = useRef<Partial<Record<'pickup' | 'dropoff' | 'user', Marker>>>({})
  const routeRef = useRef<LngLat[] | null>(null)
  const movedByRider = useRef(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [centre, setCentre] = useState<LngLat | null>(null)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)

  useEffect(() => {
    let active = true
    void cityCentre(city).then(point => { if (active) { setCentre(point); onCentre?.(point) } })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null
    import('maplibre-gl').then(lib => {
      if (cancelled || !box.current) return
      libRef.current = lib
      try {
        map = new lib.Map({
          container: box.current,
          style: STYLE_URL,
          ...EMPTY_VIEW,
          attributionControl: { compact: false },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: false,
          fadeDuration: reducedMotion() ? 0 : 300,
        })
      } catch { setFailed(true); return }
      map.touchZoomRotate.disableRotation()
      map.keyboard.disableRotation()
      mapRef.current = map
      const addRoute = () => {
        if (!map || !map.getStyle() || map.getSource('ride-route')) return
        try { map.addSource('ride-route', { type: 'geojson', data: lineData(routeRef.current) })
        map.addLayer({ id: 'ride-route-casing', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 11] } })
        map.addLayer({ id: 'ride-route-line', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0e5c5c', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 6.5] } }) } catch { /* retried on the next styledata */ }
      }
      map.on('style.load', () => { tint(map!); addRoute(); setReady(true) })
      map.on('styledata', addRoute)
      map.on('error', event => { if (!map?.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ''))) setFailed(true) })
      const rider = (event: { originalEvent?: unknown }) => { if (event.originalEvent) movedByRider.current = true }
      map.on('dragstart', rider); map.on('zoomstart', rider)
      const canvas = map.getCanvas()
      canvas.setAttribute('aria-label', 'Map')
    }).catch(() => setFailed(true))
    return () => { cancelled = true; map?.remove(); mapRef.current = null; markers.current = {} }
  }, [])

  // Pins.
  useEffect(() => {
    const map = mapRef.current; const lib = libRef.current
    if (!ready || !map || !lib) return
    const place = (key: 'pickup' | 'dropoff' | 'user', point: LngLat | null | undefined, label?: string | null) => {
      markers.current[key]?.remove(); delete markers.current[key]
      if (!point) return
      markers.current[key] = new lib.Marker({ element: pinElement(key, label), anchor: key === 'dropoff' ? 'bottom' : 'center' }).setLngLat(point).addTo(map)
    }
    place('user', user && (!pickup?.point || pickup.point.join() !== user.join()) ? user : null)
    place('pickup', pickup?.point)
    place('dropoff', dropoff?.point, dropoff?.label)
  }, [ready, user, pickup?.point, dropoff?.point, dropoff?.label, pickup?.label])

  // Route line.
  useEffect(() => {
    routeRef.current = route?.length ? route : null
    const source = mapRef.current?.getSource('ride-route') as GeoJSONSource | undefined
    source?.setData(lineData(routeRef.current))
  }, [ready, route])

  // A new trip (new points or route) is always framed; covered-area changes only while following.
  const tripKey = [pickup?.point?.join(), dropoff?.point?.join(), route?.length, user?.join(), centre?.join()].join('|')
  const lastTrip = useRef('')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const newTrip = lastTrip.current !== tripKey
    if (!newTrip && (!follow || movedByRider.current)) return
    if (newTrip) movedByRider.current = false
    lastTrip.current = tripKey
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const room = (start: number, end: number, size: number) => { const total = start + end; const max = Math.max(size - 80, 0); return total > max && total > 0 ? [start * max / total, end * max / total] : [start, end] }
    const [top, bottom] = room(insets.top + 48, insets.bottom + 40, height)
    const [left, right] = room(insets.left + 48, insets.right + 48, width)
    const padding = { top, bottom, left, right }
    const duration = reducedMotion() ? 0 : 700
    const points = [pickup?.point, dropoff?.point, ...(route || [])].filter(Boolean) as LngLat[]
    const lib = libRef.current
    if (!lib) return
    // Always fitBounds with per-call padding: easeTo({padding}) would leave padding on the map,
    // which maplibre adds to every later fit. A lone point is a small box around it.
    const box = (point: LngLat, span: number) => new lib.LngLatBounds([point[0] - span, point[1] - span * 0.8], [point[0] + span, point[1] + span * 0.8])
    if (points.length >= 2) {
      const bounds = points.reduce((all, point) => all.extend(point), new lib.LngLatBounds(points[0], points[0]))
      map.fitBounds(bounds, { padding, maxZoom: 15.5, duration })
    } else if (points.length === 1 || user) map.fitBounds(box(points[0] || user!, 0.006), { padding, maxZoom: 15, duration })
    else if (centre) map.fitBounds(box(centre, 0.05), { padding, maxZoom: 13, duration })
  }, [ready, tripKey, follow, insets.top, insets.bottom, insets.left, insets.right, pickup?.point, dropoff?.point, route, user, centre])

  return <div className={`ride-map ${className}`} style={{ '--map-inset-bottom': `${insets.bottom}px`, '--map-inset-top': `${insets.top}px` } as React.CSSProperties}>
    <div ref={box} style={{ position: 'absolute', inset: 0 }} className="touch-none" role="region" aria-label="Map" />
    {failed && <div className="absolute inset-0 grid place-items-center bg-[#dceef5]"><p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow">Map unavailable</p></div>}
  </div>
}

function lineData(coordinates: LngLat[] | null): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: coordinates && coordinates.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [] }
}
