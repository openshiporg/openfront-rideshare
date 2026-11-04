import { NextRequest, NextResponse } from 'next/server'
import { routeBetween, straightLine, validPoint } from '@/features/integrations/mapping/osm'

// The driving line between two points for the rider's map (OSRM, proxied and cached; a straight
// line when the router is unavailable).   GET /api/route?from=lon,lat&to=lon,lat
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const from = validPoint((params.get('from') || '').split(','))
  const to = validPoint((params.get('to') || '').split(','))
  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  try {
    const path = await routeBetween(from, to)
    return NextResponse.json(path, { headers: { 'Cache-Control': path.provider === 'osrm' ? 'public, max-age=1800' : 'no-store' } })
  } catch {
    return NextResponse.json(straightLine(from, to), { headers: { 'Cache-Control': 'no-store' } })
  }
}
