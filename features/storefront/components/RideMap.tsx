'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export type LngLat = [number, number]
/** A pin: `note` is the bubble's second line (time, price); `approximate` is an area, not a chosen spot
 * (framed at city zoom); `onMove` makes it draggable. */
export type MapPlace = { label?: string | null; point?: LngLat | null; note?: string | null; approximate?: boolean; onMove?: (point: LngLat) => void }
/** Centre-pin mode (Uber's "move the map to set pickup"): the map pans under a fixed pin. */
export type MapPinMode = { kind: 'pickup' | 'dropoff'; onCentre: (point: LngLat) => void }
export type MapInsets = { top: number; right: number; bottom: number; left: number }
export type RoutePath = { coordinates: LngLat[]; distanceMeters: number; durationSeconds: number; provider: string }

// OpenFreeMap: open vector tiles, no key, OpenStreetMap data (attribution stays on the map).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const EMPTY_VIEW = { center: [-98.5, 39.5] as LngLat, zoom: 3 }

/** Positron, recoloured to the storefront's harbour palette: blue water, green parks, white streets. */
function tint(map: MapLibreMap) {
  const paint: Array<[string, string, unknown]> = [
    ['background', 'background-color', '#eef1ee'],
    ['water', 'fill-color', '#a9d6ec'],
    ['waterway', 'line-color', '#9dcde4'],
    ['park', 'fill-color', '#cfe7c9'],
    ['landcover_wood', 'fill-color', '#d3e9cd'],
    ['landuse_residential', 'fill-color', '#ebede8'],
    ['building', 'fill-color', '#e2e5e0'],
    ['aeroway-area', 'fill-color', '#e4e8ec'],
    ['road_area_pier', 'fill-color', '#f7f8f6'],
    ['highway_path', 'line-color', '#f8faf8'],
    ['highway_minor', 'line-color', '#ffffff'],
    ['highway_major_inner', 'line-color', '#ffffff'],
    ['highway_major_subtle', 'line-color', '#ffffff'],
    ['highway_major_casing', 'line-color', '#d3dbd8'],
    ['highway_motorway_inner', 'line-color', '#f9e6a6'],
    ['highway_motorway_subtle', 'line-color', '#f9e6a6'],
    ['highway_motorway_casing', 'line-color', '#e2cf8f'],
    ['highway_motorway_bridge_inner', 'line-color', '#f9e6a6'],
    ['highway_motorway_bridge_casing', 'line-color', '#e2cf8f'],
    ['railway', 'line-color', '#c9cfcc'],
    ['railway_transit', 'line-color', '#c9cfcc'],
    ['water_name_point_label', 'text-color', '#2f6f8f'],
    ['water_name_line_label', 'text-color', '#2f6f8f'],
    ['waterway_line_label', 'text-color', '#2f6f8f'],
    ['highway-name-path', 'text-color', '#6b7c7e'],
    ['highway-name-minor', 'text-color', '#56696b'],
    ['highway-name-major', 'text-color', '#3e5356'],
    ['airport', 'text-color', '#3e5356'],
    ['label_city', 'text-color', '#12333a'],
    ['label_city_capital', 'text-color', '#12333a'],
    ['label_town', 'text-color', '#163a3e'],
    ['label_village', 'text-color', '#2a4f53'],
    ['label_other', 'text-color', '#4a5f62'],
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
const escape = (text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
const DROP_SVG = '<svg viewBox="0 0 26 34" width="30" height="39"><path d="M13 0C5.8 0 0 5.6 0 12.6 0 22 13 34 13 34S26 22 26 12.6C26 5.6 20.2 0 13 0Z" fill="#0b4a4a"/><circle cx="13" cy="12.5" r="5" fill="#fff"/></svg>'

/** A pin's bubble: the place on one line, the note (time, price) under it. */
function bubble(label?: string | null, note?: string | null) {
  if (!label && !note) return ''
  return `<b>${label ? `<span>${escape(label)}</span>` : ''}${note ? `<i>${escape(note)}</i>` : ''}</b>`
}

function pinElement(kind: 'pickup' | 'dropoff' | 'user', place?: MapPlace | null, pulse?: boolean) {
  const element = document.createElement('div')
  element.setAttribute('aria-hidden', 'true')
  if (kind === 'user') {
    element.className = 'ride-map-user'
    element.innerHTML = '<span></span>'
  } else if (kind === 'pickup') {
    element.className = `ride-map-pickup${pulse ? ' is-pulsing' : ''}${place?.onMove ? ' is-movable' : ''}`
    element.innerHTML = `${bubble(place?.note ? 'Pickup' : null, place?.note)}<span class="ride-map-dot"><span></span></span>`
  } else {
    element.className = `ride-map-dropoff${place?.onMove ? ' is-movable' : ''}`
    element.innerHTML = `${bubble(shortPlace(place?.label), place?.note)}${DROP_SVG}`
  }
  return element
}

/** "Del Amo Fashion Center, 3525 West Carson Street" → "Del Amo Fashion Center". */
function shortPlace(label?: string | null) {
  const first = label?.split(',')[0]?.trim()
  return first ? (first.length > 28 ? `${first.slice(0, 27)}…` : first) : null
}

/**
 * The rider's live map: real streets (MapLibre + OpenFreeMap), one-finger pan and pinch zoom, the
 * pickup and destination pins (with time/price bubbles, draggable to adjust), and the route between
 * them. `insets` is the part of the map the page covers (the phone sheet, the desktop panel), so the
 * trip is always framed in the open area. `pinMode` turns the map into a pin-setter: it pans under a
 * fixed centre pin and reports the point it settles on.
 */
export function RideMap({ city, pickup, dropoff, route, user, insets, follow = true, onCentre, pinMode, searching, className = '' }: {
  city?: string | null
  pickup?: MapPlace | null
  dropoff?: MapPlace | null
  route?: LngLat[] | null
  user?: LngLat | null
  insets: MapInsets
  /** Reframe when the covered area changes (off while the rider's sheet is at full height). */
  follow?: boolean
  onCentre?: (centre: LngLat | null) => void
  pinMode?: MapPinMode | null
  /** A request is out: the pickup pulses while the fleet finds a driver. */
  searching?: boolean
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
  const [wandered, setWandered] = useState(false)
  const [reframe, setReframe] = useState(0)
  const [pinLifted, setPinLifted] = useState(false)
  // The map stays under its land tint until it shows the rider's city (never a flash of the whole continent).
  const [framed, setFramed] = useState(false)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)
  const insetsRef = useRef(insets)
  insetsRef.current = insets
  const pinModeRef = useRef(pinMode)
  pinModeRef.current = pinMode

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
      // Zoom buttons for mouse users (hidden on phones, where pinch and double-tap zoom).
      map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right')
      mapRef.current = map
      const addRoute = () => {
        if (!map || !map.getStyle() || map.getSource('ride-route')) return
        try { map.addSource('ride-route', { type: 'geojson', data: lineData(routeRef.current) })
        map.addLayer({ id: 'ride-route-casing', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 13] } })
        map.addLayer({ id: 'ride-route-line', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0e5c5c', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7] } }) } catch { /* retried on the next styledata */ }
      }
      map.on('style.load', () => { tint(map!); addRoute(); setReady(true) })
      map.on('styledata', addRoute)
      map.on('error', event => { if (!map?.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ''))) setFailed(true) })
      const rider = (event: { originalEvent?: unknown }) => {
        if (!event.originalEvent) return
        movedByRider.current = true; setWandered(true)
        if (pinModeRef.current) setPinLifted(true)
      }
      map.on('dragstart', rider); map.on('zoomstart', rider)
      // Centre-pin mode: the spot under the pin once the map settles.
      map.on('moveend', () => {
        setPinLifted(false)
        const mode = pinModeRef.current
        if (!mode || !map) return
        const { clientWidth: width, clientHeight: height } = map.getContainer()
        const inset = insetsRef.current
        const at = map.unproject([inset.left + (width - inset.left - inset.right) / 2, inset.top + (height - inset.top - inset.bottom) / 2])
        mode.onCentre([Math.round(at.lng * 1e5) / 1e5, Math.round(at.lat * 1e5) / 1e5])
      })
      const canvas = map.getCanvas()
      canvas.setAttribute('aria-label', 'Map')
    }).catch(() => setFailed(true))
    return () => { cancelled = true; map?.remove(); mapRef.current = null; markers.current = {} }
  }, [])

  // Pins (the one being set by the centre pin is drawn by the overlay instead).
  const pickupMove = useRef(pickup?.onMove); pickupMove.current = pickup?.onMove
  const dropoffMove = useRef(dropoff?.onMove); dropoffMove.current = dropoff?.onMove
  useEffect(() => {
    const map = mapRef.current; const lib = libRef.current
    if (!ready || !map || !lib) return
    const place = (key: 'pickup' | 'dropoff' | 'user', point: LngLat | null | undefined, data?: MapPlace | null) => {
      markers.current[key]?.remove(); delete markers.current[key]
      if (!point) return
      const movable = key !== 'user' && Boolean(data?.onMove)
      const marker = new lib.Marker({ element: pinElement(key, data, key === 'pickup' && searching), anchor: key === 'dropoff' ? 'bottom' : 'center', draggable: movable }).setLngLat(point).addTo(map)
      if (movable) marker.on('dragend', () => {
        const at = marker.getLngLat()
        const next: LngLat = [Math.round(at.lng * 1e5) / 1e5, Math.round(at.lat * 1e5) / 1e5]
        ;(key === 'pickup' ? pickupMove : dropoffMove).current?.(next)
      })
      markers.current[key] = marker
    }
    place('user', user && (!pickup?.point || pickup.point.join() !== user.join()) ? user : null)
    place('pickup', pinMode?.kind === 'pickup' ? null : pickup?.point, pickup)
    place('dropoff', pinMode?.kind === 'dropoff' ? null : dropoff?.point, dropoff)
  }, [ready, user, pickup?.point?.[0], pickup?.point?.[1], pickup?.note, Boolean(pickup?.onMove), dropoff?.point?.[0], dropoff?.point?.[1], dropoff?.label, dropoff?.note, Boolean(dropoff?.onMove), pinMode?.kind, searching]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const timer = window.setTimeout(() => setFramed(true), 6000); return () => window.clearTimeout(timer) }, [])

  // Route line.
  useEffect(() => {
    routeRef.current = route?.length ? route : null
    const source = mapRef.current?.getSource('ride-route') as GeoJSONSource | undefined
    source?.setData(lineData(routeRef.current))
  }, [ready, route])

  // Entering centre-pin mode: bring that place (or the open map's middle) under the pin, close in.
  const pinKind = pinMode?.kind
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !pinKind) return
    const point = (pinKind === 'pickup' ? pickup?.point : dropoff?.point) || user || centre
    const { top, bottom, left, right } = insetsRef.current
    if (point) map.easeTo({ center: point, zoom: Math.max(map.getZoom(), 16), offset: [(left - right) / 2, (top - bottom) / 2], duration: reducedMotion() ? 0 : 500 })
    else map.fire('moveend')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinKind])

  // A new trip (new points or route) is always framed; covered-area changes only while following.
  const tripKey = [pickup?.point?.join(), pickup?.approximate, dropoff?.point?.join(), route?.length, user?.join(), centre?.join(), reframe].join('|')
  const lastTrip = useRef('')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || pinKind) return
    const newTrip = lastTrip.current !== tripKey
    if (!newTrip && (!follow || movedByRider.current)) return
    if (newTrip) { movedByRider.current = false; setWandered(false) }
    lastTrip.current = tripKey
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const room = (start: number, end: number, size: number) => { const total = start + end; const max = Math.max(size - 80, 0); return total > max && total > 0 ? [start * max / total, end * max / total] : [start, end] }
    // Room above the pins for their bubbles.
    const [top, bottom] = room(insets.top + 96, insets.bottom + (insets.left > 200 ? 40 : 96), height)
    const [left, right] = room(insets.left + 96, insets.right + 96, width)
    const padding = { top, bottom, left, right }
    const duration = reducedMotion() ? 0 : 700
    const exact = [pickup?.approximate ? null : pickup?.point, dropoff?.point].filter(Boolean) as LngLat[]
    const points = dropoff?.point ? [pickup?.point, dropoff.point, ...(route || [])].filter(Boolean) as LngLat[] : exact
    const lib = libRef.current
    if (!lib) return
    // Always fitBounds with per-call padding: easeTo({padding}) would leave padding on the map,
    // which maplibre adds to every later fit. A lone point is a small box around it.
    const area = (point: LngLat, span: number) => new lib.LngLatBounds([point[0] - span, point[1] - span * 0.8], [point[0] + span, point[1] + span * 0.8])
    if (points.length >= 2) {
      const bounds = points.reduce((all, point) => all.extend(point), new lib.LngLatBounds(points[0], points[0]))
      map.fitBounds(bounds, { padding, maxZoom: 15.5, duration: framed ? duration : 0 })
    } else if (points.length === 1) map.fitBounds(area(points[0], 0.006), { padding, maxZoom: 15, duration: framed ? duration : 0 })
    // No chosen spot yet: the fleet's city, wide enough to recognise (its neighbourhoods and the coast).
    else if (pickup?.point || centre || user) map.fitBounds(area((pickup?.point || centre || user)!, 0.07), { padding, maxZoom: 12.5, duration: framed ? duration : 0 })
    else return
    setFramed(true)
  }, [ready, tripKey, follow, pinKind, insets.top, insets.bottom, insets.left, insets.right, pickup?.point, dropoff?.point, route, user, centre]) // eslint-disable-line react-hooks/exhaustive-deps

  const pinTop = insets.top + (Math.max(0, (box.current?.clientHeight || 0) - insets.top - insets.bottom)) / 2
  const pinLeft = insets.left + (Math.max(0, (box.current?.clientWidth || 0) - insets.left - insets.right)) / 2
  const canRecentre = wandered && !pinMode && Boolean(pickup?.point || dropoff?.point)
  return <div className={`ride-map ${className}`} style={{ '--map-inset-bottom': `${insets.bottom}px`, '--map-inset-top': `${insets.top}px` } as React.CSSProperties}>
    <div ref={box} style={{ position: 'absolute', inset: 0 }} className="touch-none" role="region" aria-label="Map" />
    {(!ready || !framed) && !failed && <div aria-hidden="true" className="ride-map-loading pointer-events-none absolute inset-0" />}
    {pinMode && <div aria-hidden="true" className={`ride-map-centre-pin pointer-events-none absolute z-10 ${pinLifted ? 'is-lifted' : ''}`} style={{ top: pinTop, left: pinLeft }}>
      <span className="ride-map-centre-shadow" />
      {pinMode.kind === 'pickup' ? <span className="ride-map-dot"><span /></span> : <span className="ride-map-drop" dangerouslySetInnerHTML={{ __html: DROP_SVG }} />}
    </div>}
    {canRecentre && <button type="button" onClick={() => { movedByRider.current = false; setWandered(false); setReframe(value => value + 1) }}
      style={{ bottom: `calc(${insets.bottom}px + 2rem)`, left: insets.left }}
      className="absolute z-20 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-[0_6px_20px_-8px_rgba(11,43,46,0.45)] transition-[bottom] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12h3M18 12h3M12 3v3M12 18v3" /><circle cx="12" cy="12" r="5" /></svg>Re-centre
    </button>}
    {failed && <div className="absolute inset-0 grid place-items-center bg-[#dceef5]"><p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink shadow">Map unavailable</p></div>}
  </div>
}

function lineData(coordinates: LngLat[] | null): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: coordinates && coordinates.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [] }
}
