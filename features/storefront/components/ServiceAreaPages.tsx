'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function ServiceAreaPages({ serviceId }: { serviceId: string }) {
  const [labels, setLabels] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  const flight = useRef(false)
  useEffect(() => { generation.current++; setLabels([]); setCursor(null); setLoaded(false); setError(false); flight.current = false; setBusy(false) }, [serviceId])
  async function load() {
    if (flight.current) return
    flight.current = true; setBusy(true); setError(false)
    const current = generation.current
    try {
      const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ query: `query PublicAreas($id: ID!, $after: ID) { marketplaceRideshareServiceAreas(serviceId: $id, after: $after) { items { id publicRegionLabel } nextCursor } }`, variables: { id: serviceId, after: cursor } }) })
      const payload = await response.json()
      const page = payload.data?.marketplaceRideshareServiceAreas
      if (!response.ok || payload.errors?.length || !Array.isArray(page?.items) || page.items.length > 24 || page.items.some((row: any) => typeof row.id !== 'string' || typeof row.publicRegionLabel !== 'string')) throw new Error()
      if (generation.current === current) { setLabels(page.items.map((row: any) => row.publicRegionLabel)); setCursor(page.nextCursor || null); setLoaded(true) }
    } catch { if (generation.current === current) setError(true) }
    finally { if (generation.current === current) { flight.current = false; setBusy(false) } }
  }
  return <div className="mt-2 min-w-0 space-y-2 text-xs" aria-live="polite">{loaded && <ul className="list-inside list-disc break-words">{labels.map((label, index) => <li key={index}>{label}</li>)}</ul>}{(!loaded || cursor) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>{busy ? 'Loading areas…' : loaded ? 'More service areas' : 'Browse service areas'}</Button>}{loaded && !cursor && <p>End of published service areas.</p>}{error && <p role="alert">Service areas are unavailable. Try again.</p>}</div>
}
