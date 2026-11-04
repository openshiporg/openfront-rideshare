import { NextRequest, NextResponse } from 'next/server'
import { reversePlace, searchPlaces, validPoint } from '@/features/integrations/mapping/osm'

// Place suggestions for the rider's pickup and destination (Photon, proxied so the open service
// sees one identified, cached, rate-limited client).
//   GET /api/places?q=pier&near=-118.30,33.79       search, nearest first
//   GET /api/places?at=-118.30,33.79                the place at a point (Use my location)
//   GET /api/places?area=Harbor%20City              the city or district itself (map's opening view)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const point = (name: string) => { const raw = params.get(name); return raw ? validPoint(raw.split(',')) : null }
  try {
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
  } catch {
    return NextResponse.json({ places: [] }, { status: 502 })
  }
}
