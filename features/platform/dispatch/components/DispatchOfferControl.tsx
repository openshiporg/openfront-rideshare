'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDurableCommand } from '@/features/platform/components/durableCommand'
import { Search } from 'lucide-react'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { OperationsOffNotice } from '@/features/platform/components/OperationsOffNotice'

type Candidate = { driverId: string; driverName: string; vehicleId: string; vehicleLabel: string; capacity: number }
type CandidatePage = { requestId: string; actorId: string; evaluatedAt: string; items: Candidate[]; nextCursor: string | null; blockedReason: string | null }
export function DispatchOfferControl({ request, actionsEnabled, actorId = '', operationsOff = false }: { request: { id: string; status: string }; actionsEnabled: boolean; actorId?: string; operationsOff?: boolean }) {
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
      } catch { if (controllerRef.current === controller) setError('Driver search unavailable.') }
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
      setMaintenanceResult(`${result.releasedCount} expired offers released${result.hasMore ? '; more remain' : ''}`)
      setPage(null); setCursor(null); setRetry(value => value + 1); router.refresh()
    } catch { setMaintenanceResult('Release unconfirmed. Try again.') }
    finally { maintenanceFlight.current = false; setMaintenanceBusy(false) }
  }
  async function offer() {
    if (command.pending || command.busy || !command.ready || !actionsEnabled || loading || !page) return
    const candidate = page.items.find(item => JSON.stringify([item.driverId,item.vehicleId]) === selection)
    if (!candidate) return
    await command.execute({ purpose: 'offer', body: { requestId: request.id, driverId: candidate.driverId, vehicleId: candidate.vehicleId } })
  }
  if (command.pending) return <div className="space-y-2 rounded-[6px] border border-amber-500/40 bg-amber-500/5 p-3" data-command-pending="true"><StatusTitle as="p" tone="amber" className="text-sm font-medium">Offer unconfirmed</StatusTitle><ActionTrack><TrackButton tone="primary" disabled={command.busy || !command.ready} onClick={() => void command.execute()}>Recover offer</TrackButton></ActionTrack>{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}</div>
  if (!['requested','matching'].includes(request.status)) return null
  if (!actionsEnabled) return operationsOff ? <OperationsOffNotice /> : <p role="status" className="self-start rounded-[4px] bg-muted px-3 py-1.5 text-xs text-muted-foreground md:justify-self-end">Reload to dispatch</p>
  return <div className="min-w-0 space-y-3" data-command-pending={command.busy ? 'true' : undefined}>
    <div className="flex md:justify-end"><ActionTrack>
      <TrackButton tone={expanded ? 'default' : 'primary'} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Close' : 'Find driver'}</TrackButton>
      <TrackButton tone="quiet" disabled={maintenanceBusy || command.busy} onClick={() => void releaseElapsed()}>{maintenanceBusy ? 'Releasing…' : 'Release expired offers'}</TrackButton>
    </ActionTrack></div>
    {maintenanceResult && <p role="status" className="text-xs text-muted-foreground">{maintenanceResult}</p>}
    {expanded && <div className="space-y-3 rounded-[6px] border bg-muted/30 p-3">
      <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); setPage(null); setQuery(queryInput.trim()); setCursor(null); setRetry(value => value + 1) }}>
        <label className="relative min-w-0 flex-1"><span className="sr-only">Driver name or ID</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input className="h-9 w-full rounded-[4px] border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Driver name or ID" maxLength={100} value={queryInput} onChange={event => setQueryInput(event.target.value)} /></label>
        <ActionTrack><TrackButton type="submit" disabled={loading}>Search</TrackButton></ActionTrack>
      </form>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Checking drivers…</p> : page?.blockedReason ? <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{page.blockedReason}</p> : page && (page.items.length
        ? <fieldset disabled={command.busy} className="space-y-2"><legend className="mb-1 text-xs text-muted-foreground">Checked {new Date(page.evaluatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</legend>
            <div className="divide-y overflow-hidden rounded-[4px] border bg-background">{page.items.map(item => { const value = JSON.stringify([item.driverId, item.vehicleId]); return <label key={value} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm has-[:checked]:bg-muted"><input type="radio" name={`candidate-${request.id}`} value={value} checked={selection === value} onChange={() => setSelection(value)} className="size-4 accent-foreground" /><span className="min-w-0 flex-1"><span className="block font-medium [overflow-wrap:anywhere]">{item.driverName}</span><span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{item.vehicleLabel}</span></span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.capacity} seats</span></label> })}</div>
            <ActionTrack><TrackButton tone="primary" disabled={command.busy || !command.ready || !selection} onClick={() => void offer()}>{command.busy ? 'Offering…' : 'Offer ride'}</TrackButton>{page.nextCursor && <TrackButton disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(page.nextCursor) }}>More drivers</TrackButton>}<TrackButton tone="quiet" disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(null); setRetry(value => value + 1) }}>First page</TrackButton></ActionTrack>
          </fieldset>
        : <div className="space-y-2"><p role="status" className="text-sm text-muted-foreground">No eligible driver on this page</p><ActionTrack>{page.nextCursor && <TrackButton disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(page.nextCursor) }}>More drivers</TrackButton>}<TrackButton disabled={loading || command.busy} onClick={() => { setPage(null); setCursor(null); setRetry(value => value + 1) }}>Check again</TrackButton></ActionTrack></div>)}
      {!loading && !page && error && <ActionTrack><TrackButton onClick={() => { setPage(null); setCursor(null); setRetry(value => value + 1) }}>Retry</TrackButton></ActionTrack>}
    </div>}
    {command.intent?.phase === 'resolved' && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{command.intent.receipt}</p>}{command.error && <p role="alert" className="text-xs text-destructive">{command.error}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
