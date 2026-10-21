'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDurableCommand } from '@/features/platform/components/durableCommand'
import { Button } from '@/components/ui/button'

type Candidate = { driverId: string; driverName: string; vehicleId: string; vehicleLabel: string; capacity: number }
type CandidatePage = { requestId: string; actorId: string; evaluatedAt: string; items: Candidate[]; nextCursor: string | null; blockedReason: string | null }
export function DispatchOfferControl({ request, actionsEnabled, actorId = '' }: { request: { id: string; status: string }; actionsEnabled: boolean; actorId?: string }) {
  const router = useRouter()
  const command = useDurableCommand(actorId, `request:${request.id}`)
  const [expanded, setExpanded] = useState(false)
  const [selection, setSelection] = useState('')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState<CandidatePage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const maintenanceFlight = useRef(false)
  const [maintenanceBusy, setMaintenanceBusy] = useState(false)
  const [maintenanceResult, setMaintenanceResult] = useState('')
  useEffect(() => { if (command.intent?.phase === 'resolved') router.refresh() }, [command.intent?.key, command.intent?.phase, router])
  useEffect(() => {
    const invalidate = () => { controllerRef.current?.abort(); setPage(null); setSelection(''); setCursor(null); setRetry(value => value + 1) }
    window.addEventListener('focus', invalidate); window.addEventListener('online', invalidate)
    return () => { window.removeEventListener('focus', invalidate); window.removeEventListener('online', invalidate) }
  }, [])
  useEffect(() => {
    if (!expanded || !actionsEnabled || command.pending) return
    const controller = new AbortController()
    controllerRef.current?.abort(); controllerRef.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    setLoading(true); setPage(null); setSelection(''); setError('')
    void (async () => {
      try {
        const response = await fetch('/api/graphql', { signal: controller.signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: `query DispatchCandidates($requestId: ID!, $cursor: String, $query: String) { dispatchCandidatePage(requestId: $requestId, cursor: $cursor, query: $query) }`, variables: { requestId: request.id, cursor, query } }) })
        const payload = await response.json()
        const result = payload.data?.dispatchCandidatePage
        if (!response.ok || payload.errors?.length || result?.requestId !== request.id || result.actorId !== actorId || !Number.isFinite(Date.parse(result.evaluatedAt)) || !Array.isArray(result.items) || result.items.length > 20 || (result.nextCursor !== null && typeof result.nextCursor !== 'string') || (result.blockedReason !== null && typeof result.blockedReason !== 'string') || result.items.some((item: any) => ['driverId','driverName','vehicleId','vehicleLabel'].some(field => typeof item?.[field] !== 'string' || !item[field]) || !Number.isSafeInteger(item.capacity) || item.capacity < 1)) throw new Error()
        if (controllerRef.current === controller && !controller.signal.aborted) setPage(result)
      } catch { if (controllerRef.current === controller) setError('Candidate search is unavailable. Refresh to check your current access and the request.') }
      finally { window.clearTimeout(timeout); if (controllerRef.current === controller) { controllerRef.current = null; setLoading(false) } }
    })()
    return () => { window.clearTimeout(timeout); controller.abort(); if (controllerRef.current === controller) controllerRef.current = null }
  }, [request.id, actorId, expanded, actionsEnabled, command.pending, cursor, query, retry])
  async function releaseElapsed() {
    if (maintenanceFlight.current || command.pending || command.busy) return
    maintenanceFlight.current = true; setMaintenanceBusy(true); setMaintenanceResult('')
    try {
      const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12_000), body: JSON.stringify({ query: `mutation ReleaseElapsed($requestId: ID!) { expireRequestFleetOffers(requestId: $requestId) { releasedCount hasMore } }`, variables: { requestId: request.id } }) })
      const payload = await response.json()
      const result = payload.data?.expireRequestFleetOffers
      if (!response.ok || payload.errors?.length || !Number.isSafeInteger(result?.releasedCount) || result.releasedCount < 0 || result.releasedCount > 50 || typeof result.hasMore !== 'boolean') throw new Error()
      setMaintenanceResult(`${result.releasedCount} elapsed offers released.${result.hasMore ? ' More elapsed offers remain; run another bounded release.' : ''}`)
      setPage(null); setCursor(null); setRetry(value => value + 1); router.refresh()
    } catch { setMaintenanceResult('Release outcome is unconfirmed. Refresh availability or repeat this idempotent expiry check.') }
    finally { maintenanceFlight.current = false; setMaintenanceBusy(false) }
  }
  async function offer() {
    if (command.pending || command.busy || !command.ready || !actionsEnabled || loading || !page) return
    const candidate = page.items.find(item => JSON.stringify([item.driverId,item.vehicleId]) === selection)
    if (!candidate) return
    await command.execute({ purpose: 'offer', body: { requestId: request.id, driverId: candidate.driverId, vehicleId: candidate.vehicleId } })
  }
  if (command.pending) return <div className="mt-3 space-y-2" data-command-pending="true"><p role="status" className="text-xs text-muted-foreground">An original dispatch command is unresolved.</p><Button type="button" variant="outline" size="sm" disabled={command.busy || !command.ready} onClick={() => void command.execute()}>Recover original offer</Button>{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}</div>
  if (!['requested','matching'].includes(request.status)) return null
  if (!actionsEnabled) return <p role="status" className="mt-3 text-xs text-muted-foreground">New dispatch commands are unavailable in this deployment.</p>
  return <div className="mt-4 min-w-0 space-y-3" data-command-pending={command.busy ? 'true' : undefined}>
    <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide candidates' : 'Find driver / vehicle'}</Button>
    {expanded && <><form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); setPage(null); setQuery(queryInput.trim()); setCursor(null); setRetry(value => value + 1) }}><label className="min-w-0 flex-1 text-sm">Driver name or ID<input className="mt-1 h-9 w-full rounded-md border bg-background px-3" maxLength={100} value={queryInput} onChange={event => setQueryInput(event.target.value)} /></label><Button type="submit" size="sm" variant="outline" disabled={loading}>Search</Button></form>
      {loading ? <p role="status" className="text-sm">Checking candidate page…</p> : page?.blockedReason ? <p role="status" className="text-sm">{page.blockedReason}</p> : page && <><p className="text-xs text-muted-foreground">Checked {new Date(page.evaluatedAt).toLocaleTimeString()}. Capacity is rechecked before an offer.</p>{page.items.length ? <div className="flex flex-wrap gap-2"><select aria-label="Candidate driver and vehicle" className="h-9 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm sm:w-auto" disabled={command.busy} value={selection} onChange={event => setSelection(event.target.value)}><option value="">Choose driver / vehicle</option>{page.items.map(item => <option key={JSON.stringify([item.driverId,item.vehicleId])} value={JSON.stringify([item.driverId,item.vehicleId])}>{item.driverName} · {item.vehicleLabel} · {item.capacity}</option>)}</select><Button type="button" size="sm" disabled={command.busy || !command.ready || !selection} onClick={() => void offer()}>{command.busy ? 'Offering…' : 'Offer ride'}</Button></div> : <p role="status" className="text-sm">No eligible pair on this page.{page.nextCursor ? ' Continue to check more candidates.' : ' Search again or refresh when availability changes.'}</p>}</>}
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(null); setRetry(value => value + 1) }}>First page / retry</Button>{page?.nextCursor && <Button type="button" size="sm" variant="outline" disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(page.nextCursor) }}>More candidates</Button>}</div>
      <Button type="button" size="sm" variant="outline" disabled={maintenanceBusy || command.busy} onClick={() => void releaseElapsed()}>{maintenanceBusy ? 'Checking elapsed offers…' : 'Release elapsed fleet offers'}</Button>{maintenanceResult && <p role="status" className="text-xs text-muted-foreground">{maintenanceResult}</p>}<p className="text-xs text-muted-foreground">An offer does not confirm rider notification or assignment.</p></>}
    {command.intent?.phase === 'resolved' && <p role="status" className="text-xs text-muted-foreground">{command.intent.receipt}</p>}{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
