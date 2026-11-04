import { NextRequest, NextResponse } from 'next/server'
import { PlacesBusy, reversePlace, searchPlaces, validPoint } from '@/features/integrations/mapping/osm'

// Place suggestions for the rider's pickup and destination (Photon, proxied so the open service
// sees one identified, cached, rate-limited client).
//   GET /api/places?q=pier&near=-118.30,33.79       search, nearest first
//   GET /api/places?at=-118.30,33.79                the place at a point (Use my location)
//   GET /api/places?area=Harbor%20City              the city or district itself (map's opening view)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const point = (name: string) => { const raw = params.get(name); return raw ? validPoint(raw.split(',')) : null }
  try {
    // Warm-up when a place field opens: one cached lookup, so the server and its Photon connection are ready
    // before the rider's first search (repeat warms in the cache window cost Photon nothing).
    const warm = point('warm')
    if (warm) { await reversePlace([Math.round(warm[0] * 100) / 100, Math.round(warm[1] * 100) / 100]).catch(() => null); return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }) }
    const at = point('at')
    if (at) {
      const place = await reversePlace(at)
      return NextResponse.json({ places: place ? [{ ...place, point: at }] : [] }, { headers: { 'Cache-Control': 'private, max-age=300' } })
    }
    const area = params.get('area')
    if (area) return NextResponse.json({ places: (await searchPlaces(area, null, { limit: 1, kind: 'area' })) }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
    const q = params.get('q') || ''
    if (q.trim().length < 2) return NextResponse.json({ places: [] })
    const near = point('near')
    const places = await searchPlaces(q, near, { limit: 6, within: near ? 1.5 : undefined })
    return NextResponse.json({ places }, { headers: { 'Cache-Control': 'public, max-age=600' } })
  } catch (error) {
    if (error instanceof PlacesBusy) return NextResponse.json({ places: [], busy: true }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' } })
    return NextResponse.json({ places: [] }, { status: 502 })
  }
}
