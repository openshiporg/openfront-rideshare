'use client'

import { useEffect, useRef, useState } from 'react'
import { RiderButton } from './RiderPills'

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
  return <div className="min-w-0 space-y-2 text-xs" aria-live="polite">
    {loaded && (labels.length ? <ul aria-label="All service areas" className="flex flex-wrap gap-1.5">{labels.map((label, index) => <li key={index} className="rounded-[4px] bg-lane px-2.5 py-1 [overflow-wrap:anywhere]">{label}</li>)}</ul> : <p className="text-muted-foreground">No areas listed</p>)}
    {(!loaded || cursor) && <RiderButton tone="quiet" size="sm" disabled={busy} onClick={() => void load()} className="-ml-3">{busy ? 'Loading…' : loaded ? 'More areas' : 'All service areas'}</RiderButton>}
    {error && <p role="alert" className="text-[#ff8a7f]">Areas unavailable. Try again.</p>}
  </div>
}
