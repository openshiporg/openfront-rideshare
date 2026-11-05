'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLat } from '../lib/api'

/**
 * The one map under every rider screen (MapLibre + OpenFreeMap, OpenStreetMap data). Black-and-white
 * street map, the rider's blue location dot, a black route, a round pickup and a square drop-off,
 * as Uber draws them. `bottom` is how much of the map the sheet covers, so the trip is framed in
 * the open part. In `pin` mode the map pans under a fixed centre pin and reports where it settles.
 */
export type MapPin = { point: LngLat; label?: string | null }
export function RiderMap({ user, pickup, dropoff, route, bottom, top = 72, pin, searching, onPinMove }: {
  user?: LngLat | null
  pickup?: MapPin | null
  dropoff?: MapPin | null
  route?: LngLat[] | null
  bottom: number
  top?: number
  pin?: 'pickup' | 'dropoff' | null
  searching?: boolean
  onPinMove?: (point: LngLat) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const lib = useRef<typeof import('maplibre-gl') | null>(null)
  const markers = useRef<Record<string, Marker | undefined>>({})
  const routeRef = useRef<LngLat[] | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [moving, setMoving] = useState(false)
  const pinRef = useRef(pin); pinRef.current = pin
  const onPinRef = useRef(onPinMove); onPinRef.current = onPinMove
  const insets = useRef({ top, bottom }); insets.current = { top, bottom }

  useEffect(() => {
    let cancelled = false
    import('maplibre-gl').then(maplibre => {
      if (cancelled || !box.current) return
      lib.current = maplibre
      let instance: MapLibreMap
      try {
        instance = new maplibre.Map({ container: box.current, style: 'https://tiles.openfreemap.org/styles/positron', center: [-98.5, 39.5], zoom: 3, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: reduced() ? 0 : 200 })
      } catch { setFailed(true); return }
      instance.touchZoomRotate.disableRotation()
      map.current = instance
      const addRoute = () => {
        if (instance.getSource('ride-route')) return
        try {
          instance.addSource('ride-route', { type: 'geojson', data: line(routeRef.current) })
          instance.addLayer({ id: 'ride-route-casing', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 12] } })
          instance.addLayer({ id: 'ride-route-line', type: 'line', source: 'ride-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000000', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 6] } })
        } catch { /* retried on the next styledata */ }
      }
      instance.on('style.load', () => { monochrome(instance); addRoute(); setReady(true) })
      instance.once('load', () => instance.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
      instance.on('styledata', addRoute)
      instance.on('error', event => { if (!instance.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ''))) setFailed(true) })
      instance.on('dragstart', () => { if (pinRef.current) setMoving(true) })
      instance.on('moveend', () => {
        setMoving(false)
        if (!pinRef.current) return
        const { clientWidth: w, clientHeight: h } = instance.getContainer()
        const at = instance.unproject([w / 2, insets.current.top + (h - insets.current.top - insets.current.bottom) / 2])
        onPinRef.current?.([Math.round(at.lng * 1e5) / 1e5, Math.round(at.lat * 1e5) / 1e5])
      })
    }).catch(() => setFailed(true))
    return () => { cancelled = true; map.current?.remove(); map.current = null; markers.current = {} }
  }, [])

  // Markers.
  useEffect(() => {
    const instance = map.current, maplibre = lib.current
    if (!ready || !instance || !maplibre) return
    const place = (key: string, point: LngLat | null | undefined, element: () => HTMLElement) => {
      markers.current[key]?.remove(); delete markers.current[key]
      if (point) markers.current[key] = new maplibre.Marker({ element: element(), anchor: 'center' }).setLngLat(point).addTo(instance)
    }
    const sameAsPickup = user && pickup && Math.abs(user[0] - pickup.point[0]) < 1e-4 && Math.abs(user[1] - pickup.point[1]) < 1e-4
    place('user', sameAsPickup && dropoff ? null : user, () => markerElement('user'))
    place('pickup', pin === 'pickup' || (!dropoff && sameAsPickup) ? null : pickup?.point, () => markerElement('pickup', searching))
    place('dropoff', pin === 'dropoff' ? null : dropoff?.point, () => markerElement('dropoff'))
  }, [ready, user?.[0], user?.[1], pickup?.point[0], pickup?.point[1], dropoff?.point[0], dropoff?.point[1], pin, searching]) // eslint-disable-line react-hooks/exhaustive-deps

  // Route.
  useEffect(() => {
    routeRef.current = route?.length ? route : null
    ;(map.current?.getSource('ride-route') as GeoJSONSource | undefined)?.setData(line(routeRef.current))
  }, [ready, route])

  // Framing: the whole trip in the open area above the sheet, or the pickup close in.
  const frameKey = [pickup?.point.join(), dropoff?.point.join(), route?.length, user?.join(), bottom, top, pin].join('|')
  useEffect(() => {
    const instance = map.current, maplibre = lib.current
    if (!ready || !instance || !maplibre) return
    const { clientHeight: h, clientWidth: w } = instance.getContainer()
    const side = w >= 1024 ? 448 : 0 // the left panel at desktop widths
    const open = Math.max(h - top - bottom, 80)
    const duration = reduced() ? 0 : 450
    if (pin) {
      const focus = (pin === 'pickup' ? pickup?.point : dropoff?.point) || pickup?.point || user
      if (focus) instance.easeTo({ center: focus, zoom: Math.max(instance.getZoom(), 16), offset: [side / 2, (top - bottom) / 2], duration })
      return
    }
    const points = [pickup?.point, dropoff?.point, ...(dropoff ? route || [] : [])].filter(Boolean) as LngLat[]
    if (!points.length && user) points.push(user)
    if (!points.length) return
    const bounds = points.reduce((all, p) => all.extend(p), new maplibre.LngLatBounds(points[0], points[0]))
    if (points.length === 1) {
      const [lng, lat] = points[0]
      instance.fitBounds([[lng - 0.004, lat - 0.003], [lng + 0.004, lat + 0.003]] as LngLatBoundsLike, { padding: { top, bottom, left: 24 + side, right: 24 }, maxZoom: 15.5, duration })
      return
    }
    const pad = Math.min(56, open / 4)
    instance.fitBounds(bounds, { padding: { top: top + pad, bottom: bottom + pad, left: Math.min(48, w / 8) + side, right: Math.min(48, w / 8) }, maxZoom: 15.5, duration })
  }, [ready, frameKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="absolute inset-0 bg-[#f2f2f2]" style={{ ['--sheet' as string]: `${bottom}px` }}>
    <div ref={box} className="rider-map" style={{ position: 'absolute', inset: 0 }} aria-label="Map" role="region" />
    {pin && <div aria-hidden="true" className="pointer-events-none absolute left-1/2 z-10" style={{ top: top + Math.max(0, (box.current?.clientHeight || 0) - top - bottom) / 2 }}>
      <span className="absolute -left-[5px] -top-[2px] h-1 w-2.5 rounded-full bg-black/30" />
      <span className={`absolute -left-[9px] -top-[44px] flex flex-col items-center transition-transform duration-150 ease-out motion-reduce:transition-none ${moving ? '-translate-y-2' : ''}`}>
        <span className={`block size-[18px] border-[5px] border-black bg-white ${pin === 'pickup' ? 'rounded-full' : ''}`} />
        <span className="block h-6 w-[3px] bg-black" />
      </span>
    </div>}
    {failed && <p className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium shadow">Map unavailable</p>}
  </div>
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
function line(coordinates: LngLat[] | null): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: coordinates && coordinates.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [] }
}

function markerElement(kind: 'user' | 'pickup' | 'dropoff', pulse = false) {
  const element = document.createElement('div')
  element.setAttribute('aria-hidden', 'true')
  element.className = `rider-marker rider-marker-${kind}${pulse ? ' is-pulsing' : ''}`
  element.innerHTML = '<span></span>'
  return element
}

/** Positron, pushed to greys so only the trip carries colour (the blue dot) and weight (the black route). */
function monochrome(instance: MapLibreMap) {
  const paint: Array<[string, string, unknown]> = [
    ['background', 'background-color', '#f4f4f4'],
    ['water', 'fill-color', '#d9dde1'],
    ['waterway', 'line-color', '#d9dde1'],
    ['park', 'fill-color', '#e6ebe4'],
    ['landcover_wood', 'fill-color', '#e8ece6'],
    ['landuse_residential', 'fill-color', '#f0f0f0'],
    ['building', 'fill-color', '#e7e7e7'],
    ['highway_minor', 'line-color', '#ffffff'],
    ['highway_major_inner', 'line-color', '#ffffff'],
    ['highway_major_subtle', 'line-color', '#ffffff'],
    ['highway_major_casing', 'line-color', '#dcdcdc'],
    ['highway_motorway_inner', 'line-color', '#ffffff'],
    ['highway_motorway_subtle', 'line-color', '#ffffff'],
    ['highway_motorway_casing', 'line-color', '#d2d2d2'],
    ['highway_motorway_bridge_inner', 'line-color', '#ffffff'],
    ['highway_motorway_bridge_casing', 'line-color', '#d2d2d2'],
    ['water_name_point_label', 'text-color', '#7a7f85'],
    ['water_name_line_label', 'text-color', '#7a7f85'],
    ['highway-name-minor', 'text-color', '#8a8a8a'],
    ['highway-name-major', 'text-color', '#6f6f6f'],
    ['label_city', 'text-color', '#333333'],
    ['label_town', 'text-color', '#444444'],
    ['label_village', 'text-color', '#555555'],
    ['label_other', 'text-color', '#666666'],
  ]
  for (const [layer, property, value] of paint) {
    try { if (instance.getLayer(layer)) instance.setPaintProperty(layer, property, value) } catch { /* keep that layer's colour */ }
  }
}
