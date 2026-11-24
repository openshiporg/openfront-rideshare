'use client'

import { Component, useEffect, useRef, useState } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { Map, MapControls, MapMarker, MapRoute, MarkerContent, MarkerLabel, useMap } from '@/components/ui/map'
import type { LngLat } from '../lib/api'

/**
 * The one map under every rider screen, built from the mapcn components (MapLibre) on OpenFreeMap tiles
 * (OpenStreetMap data). A warm, quiet street map; the trip is the only colour on it: a teal route with a
 * soft halo, a ringed pickup and an amber drop-off pin, each with its place name. `top` and `bottom` are
 * how much of the map the header and the sheet cover, so the trip is framed in the open part. In `pin`
 * mode the map pans under a fixed centre pin and reports where it settles.
 */
export type MapPin = { point: LngLat; label?: string | null }
type Props = {
  user?: LngLat | null
  pickup?: MapPin | null
  dropoff?: MapPin | null
  route?: LngLat[] | null
  bottom: number
  top?: number
  pin?: 'pickup' | 'dropoff' | null
  searching?: boolean
  onPinMove?: (point: LngLat) => void
  onLocate?: (point: LngLat) => void
}

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const PANEL = 448 // the left panel at desktop widths
const NO_ROUTE: LngLat[] = []
const same = (a: LngLat, b: LngLat) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const round = (value: number) => Math.round(value * 1e5) / 1e5

export function RiderMap({ user, pickup, dropoff, route, bottom, top = 72, pin, searching, onPinMove, onLocate }: Props) {
  const [failed, setFailed] = useState(false)
  const [moving, setMoving] = useState(false)
  const desktop = useDesktop()

  const sameAsPickup = Boolean(user && pickup && same(user, pickup.point))
  const showUser = user && !(sameAsPickup && dropoff) ? user : null
  const showPickup = pin === 'pickup' || (!dropoff && sameAsPickup) ? null : pickup || null
  const showDropoff = pin === 'dropoff' ? null : dropoff || null
  const labelled = Boolean(showPickup && showDropoff)
  const line = route && route.length >= 2 ? route : NO_ROUTE
  const space = [showUser && { kind: 'user', point: showUser }, showPickup && { kind: 'pickup', point: showPickup.point }, showDropoff && { kind: 'dropoff', point: showDropoff.point }].filter(Boolean) as MarkerSpace[]

  return <div role="region" aria-label="Map" className="absolute inset-0 bg-[#eeece6]" style={{ ['--sheet' as string]: `${bottom}px`, ['--map-top' as string]: `${top}px` }}>
    <MapBoundary onError={() => setFailed(true)}>
      <Map className="rider-map" theme="light" styles={{ light: STYLE, dark: STYLE }} center={[-98.5, 39.5]} zoom={3} dragRotate={false} pitchWithRotate={false} touchPitch={false} fadeDuration={reduced() ? 0 : 200}>
        <MapSetup space={space} onFailed={() => setFailed(true)} />
        <Framing user={user} pickup={pickup} dropoff={dropoff} route={route} top={top} bottom={bottom} pin={pin} />
        <PinTracker pin={pin} top={top} bottom={bottom} onMoving={setMoving} onPinMove={onPinMove} />
        <MapRoute id="ride-halo" coordinates={line} color="#0f5c55" width={13} opacity={0.16} interactive={false} />
        <MapRoute id="ride-line" coordinates={line} color="#0f5c55" width={4.5} opacity={1} interactive={false} />
        {showUser && <MapMarker key="user" longitude={showUser[0]} latitude={showUser[1]} anchor="center">
          <MarkerContent className="cursor-default"><div aria-hidden="true" className="rider-marker rider-marker-user"><span /></div></MarkerContent>
        </MapMarker>}
        {showPickup && <MapMarker key="pickup" longitude={showPickup.point[0]} latitude={showPickup.point[1]} anchor="center">
          <MarkerContent className="cursor-default">
            <div aria-hidden="true" className={`rider-marker rider-marker-pickup${searching ? ' is-pulsing' : ''}`}><span /></div>
            {labelled && showPickup.label && <MarkerLabel position="bottom" className="rider-marker-label mt-1.5 bg-white text-[12px] font-semibold text-ink">{showPickup.label}</MarkerLabel>}
          </MarkerContent>
        </MapMarker>}
        {showDropoff && <MapMarker key="dropoff" longitude={showDropoff.point[0]} latitude={showDropoff.point[1]} anchor="bottom">
          <MarkerContent className="cursor-default">
            <div aria-hidden="true" className="rider-marker rider-marker-dropoff"><span><span /></span></div>
            {showDropoff.label && <MarkerLabel position="top" className="rider-marker-label mb-1.5 bg-ink text-[12px] font-semibold text-white">{showDropoff.label}</MarkerLabel>}
          </MarkerContent>
        </MapMarker>}
        <MapControls position="bottom-right" showZoom={desktop} showLocate onLocate={({ longitude, latitude }) => onLocate?.([round(longitude), round(latitude)])} className="rider-map-controls" />
      </Map>
    </MapBoundary>
    {pin && <div aria-hidden="true" className="rider-centre-pin pointer-events-none absolute z-10">
      <span className="absolute -left-[5px] -top-[2px] h-1 w-2.5 rounded-full bg-ink/30" />
      <span className={`absolute -left-[9px] -top-[44px] flex flex-col items-center transition-transform duration-150 ease-out motion-reduce:transition-none ${moving ? '-translate-y-2' : ''}`}>
        <span className={`block size-[18px] rounded-full border-[5px] bg-white shadow-[0_2px_6px_rgba(16,35,31,0.3)] ${pin === 'pickup' ? 'border-tide' : 'border-signal'}`} />
        <span className={`block h-6 w-[3px] rounded-full ${pin === 'pickup' ? 'bg-tide' : 'bg-signal'}`} />
      </span>
    </div>}
    {failed && <p className="absolute left-1/2 top-1/3 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-[14px] font-medium shadow">Map unavailable</p>}
  </div>
}

function useDesktop() {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop
}

/** A map that can't start (no WebGL) leaves the page usable: the sheet still books the ride. */
class MapBoundary extends Component<{ children: React.ReactNode; onError: () => void }, { broken: boolean }> {
  state = { broken: false }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.broken ? null : this.props.children }
}

type MarkerSpace = { kind: string; point: LngLat }
function markerSpace(points: MarkerSpace[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: points.map(({ kind, point }) => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: point } })) }
}

/** One-time map setup: no rotation, paper tones, and room for the markers among the labels. */
function MapSetup({ space, onFailed }: { space: MarkerSpace[]; onFailed: () => void }) {
  const { map, isLoaded } = useMap()
  const failed = useRef(onFailed)
  const spaceRef = useRef(space)
  useEffect(() => { failed.current = onFailed; spaceRef.current = space })

  useEffect(() => {
    if (!map) return
    map.touchZoomRotate.disableRotation()
    const onError = (event: { error?: { message?: string } }) => { if (!map.loaded() && /style|Failed to fetch/i.test(String(event?.error?.message || ''))) failed.current() }
    map.on('error', onError)
    return () => { map.off('error', onError) }
  }, [map])

  useEffect(() => {
    if (!map || !isLoaded) return
    monochrome(map)
    map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    try {
      // Markers are HTML overlays, which map labels don't avoid. An invisible symbol at each marker takes part
      // in label placement instead, so a town name never sits under the pickup or destination.
      if (!map.hasImage('ride-marker-space')) map.addImage('ride-marker-space', { width: 1, height: 1, data: new Uint8Array(4) })
      if (!map.getSource('ride-marker-space')) map.addSource('ride-marker-space', { type: 'geojson', data: markerSpace(spaceRef.current) })
      if (!map.getLayer('ride-marker-space')) map.addLayer({ id: 'ride-marker-space', type: 'symbol', source: 'ride-marker-space', layout: {
        'icon-image': 'ride-marker-space', 'icon-allow-overlap': true, 'icon-ignore-placement': false,
        // The destination pin stands above its point; the pickup dot is centred on it. Sizes include a small margin.
        'icon-size': ['match', ['get', 'kind'], 'dropoff', 44, 36],
        'icon-anchor': ['match', ['get', 'kind'], 'dropoff', 'bottom', 'center'],
      } })
    } catch { /* labels may overlap a marker; nothing else depends on this */ }
  }, [map, isLoaded])

  const key = space.map(item => `${item.kind}:${item.point.join()}`).join('|')
  useEffect(() => {
    if (!map || !isLoaded) return
    ;(map.getSource('ride-marker-space') as GeoJSONSource | undefined)?.setData(markerSpace(spaceRef.current))
  }, [map, isLoaded, key])
  return null
}

/** Framing: the whole trip in the open area between the header and the sheet, or the pickup close in. */
function Framing({ user, pickup, dropoff, route, top, bottom, pin }: Pick<Props, 'user' | 'pickup' | 'dropoff' | 'route' | 'pin'> & { top: number; bottom: number }) {
  const { map, isLoaded } = useMap()
  const frameKey = [pickup?.point.join(), dropoff?.point.join(), route?.length, user?.join(), bottom, top, pin].join('|')
  useEffect(() => {
    if (!map || !isLoaded) return
    const { clientHeight: h, clientWidth: w } = map.getContainer()
    const side = w >= 1024 ? PANEL : 0
    const open = Math.max(h - top - bottom, 80)
    const duration = reduced() ? 0 : 450
    if (pin) {
      const focus = (pin === 'pickup' ? pickup?.point : dropoff?.point) || pickup?.point || user
      if (focus) map.easeTo({ center: focus, zoom: Math.max(map.getZoom(), 16), offset: [side / 2, (top - bottom) / 2], duration })
      return
    }
    const points = [pickup?.point, dropoff?.point, ...(dropoff ? route || [] : [])].filter(Boolean) as LngLat[]
    if (!points.length && user) points.push(user)
    if (!points.length) return
    if (points.length === 1) {
      const [lng, lat] = points[0]
      map.fitBounds([[lng - 0.004, lat - 0.003], [lng + 0.004, lat + 0.003]], { padding: { top, bottom, left: 24 + side, right: 24 }, maxZoom: 15.5, duration })
      return
    }
    const lngs = points.map(point => point[0]), lats = points.map(point => point[1])
    // Room for the pins, their name labels and the map controls at the right edge.
    const pad = Math.min(72, open / 4)
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: top + pad, bottom: bottom + pad, left: 88 + side, right: 96 }, maxZoom: 15.5, duration })
  }, [map, isLoaded, frameKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Set location on map: reports the point under the fixed centre pin each time the map settles. */
function PinTracker({ pin, top, bottom, onMoving, onPinMove }: Pick<Props, 'pin' | 'onPinMove'> & { top: number; bottom: number; onMoving: (moving: boolean) => void }) {
  const { map } = useMap()
  const latest = useRef({ pin, top, bottom, onMoving, onPinMove })
  useEffect(() => { latest.current = { pin, top, bottom, onMoving, onPinMove } })
  useEffect(() => {
    if (!map) return
    const start = () => { if (latest.current.pin) latest.current.onMoving(true) }
    const end = () => {
      const { pin, top, bottom, onMoving, onPinMove } = latest.current
      onMoving(false)
      if (!pin) return
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const side = w >= 1024 ? PANEL : 0
      const at = map.unproject([(w + side) / 2, top + (h - top - bottom) / 2])
      onPinMove?.([round(at.lng), round(at.lat)])
    }
    map.on('dragstart', start)
    map.on('moveend', end)
    return () => { map.off('dragstart', start); map.off('moveend', end) }
  }, [map])
  return null
}

/** Positron, warmed to paper tones so only the trip carries colour. */
function monochrome(instance: MapLibreMap) {
  const paint: Array<[string, string, unknown]> = [
    ['background', 'background-color', '#efede7'],
    ['water', 'fill-color', '#d3e1df'],
    ['waterway', 'line-color', '#d3e1df'],
    ['park', 'fill-color', '#e1e8dc'],
    ['landcover_wood', 'fill-color', '#e8ece6'],
    ['landuse_residential', 'fill-color', '#eceae3'],
    ['building', 'fill-color', '#e4e1d9'],
    ['highway_minor', 'line-color', '#ffffff'],
    ['highway_major_inner', 'line-color', '#ffffff'],
    ['highway_major_subtle', 'line-color', '#ffffff'],
    ['highway_major_casing', 'line-color', '#dcd8ce'],
    ['highway_motorway_inner', 'line-color', '#ffffff'],
    ['highway_motorway_subtle', 'line-color', '#ffffff'],
    ['highway_motorway_casing', 'line-color', '#d3cfc4'],
    ['highway_motorway_bridge_inner', 'line-color', '#ffffff'],
    ['highway_motorway_bridge_casing', 'line-color', '#d3cfc4'],
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
    try { if (instance.getLayer(layer)) instance.setPaintProperty(layer, property as never, value as never) } catch { /* keep that layer's colour */ }
  }
}
