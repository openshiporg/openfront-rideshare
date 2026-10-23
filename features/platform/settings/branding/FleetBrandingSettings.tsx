'use client'
import { useEffect, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusDot } from '@/features/platform/components/StatusTitle'
import { LOGO_ICONS } from './icon-registry'
import { normalizeStoreLogoColor } from './store-logo'

type Branding = { actorId: string; fleetId: string; name: string; logoIcon: string; logoColor: string; updatedAt: string }
export function FleetBrandingSettings() {
  const [fleets, setFleets] = useState<Array<{ id: string; name: string }>>([])
  const [after, setAfter] = useState<string | null>(null)
  const [fleetId, setFleetId] = useState('')
  const [saved, setSaved] = useState<Branding | null>(null)
  const [logoIcon, setLogoIcon] = useState('')
  const [logoColor, setLogoColor] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const originalRef = useRef<Record<string, any> | null>(null)
  const flight = useRef(false)
  const generation = useRef(0)
  const dirty = Boolean(saved && (logoIcon !== saved.logoIcon || logoColor !== saved.logoColor))
  async function graphql(query: string, variables: Record<string,unknown> = {}) {
    const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ query, variables }) })
    const payload = await response.json()
    if (!response.ok || payload.errors?.length || !payload.data) throw new Error('Branding request is unavailable.')
    return payload.data
  }
  async function loadFleets(cursor: string | null = null) {
    try {
      const data = await graphql(`query BrandingFleets($where: FleetWhereInput!) { fleets(where: $where, orderBy: { id: asc }, take: 26) { id name } }`, { where: cursor ? { id: { gt: cursor } } : {} })
      if (!Array.isArray(data.fleets)) throw new Error()
      const rows = data.fleets.slice(0,25)
      setFleets(current => cursor ? [...current, ...rows] : rows)
      setAfter(data.fleets.length > 25 ? rows[24].id : null)
    } catch { setError('Fleets unavailable for your access.') }
  }
  useEffect(() => { void loadFleets() }, [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || uncertain) { event.preventDefault(); event.returnValue = '' } }
    const guard = (event: MouseEvent) => { const anchor = (event.target as Element)?.closest?.('a[href]'); if (anchor && (dirty || uncertain) && !window.confirm(uncertain ? 'A save is unresolved. Keep the original draft until it is reconciled. Leave this page?' : 'Discard unsaved branding changes?')) event.preventDefault() }
    window.addEventListener('beforeunload', warn); document.addEventListener('click', guard, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guard, true) }
  }, [dirty, uncertain])
  async function read(id: string) {
    if (flight.current) return
    const current = ++generation.current
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await graphql(`query FleetLogo($id: ID!) { fleetBranding(fleetId: $id) }`, { id })
      const row = data.fleetBranding
      if (row?.fleetId !== id || typeof row.logoIcon !== 'string' || typeof row.logoColor !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error()
      if (current === generation.current) {
        const stored = sessionStorage.getItem(`openfront-rideshare-branding-command-v1:${row.actorId}:${id}`)
        const original = stored ? JSON.parse(stored) : null
        if (original && (original.fleetId !== id || original.expectedActorId !== row.actorId || typeof original.idempotencyKey !== 'string')) throw new Error()
        originalRef.current = original
        setSaved(row); setLogoIcon(original?.logoIcon ?? row.logoIcon); setLogoColor(original?.logoColor ?? row.logoColor); setUncertain(Boolean(original))
        if (original) setMessage('Last save unconfirmed. Recover it before editing.')
      }
    } catch { if (current === generation.current) { setSaved(null); setError('Branding unavailable. Nothing was saved.') } }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function save() {
    if (!saved || flight.current || !dirty && !originalRef.current) return
    flight.current = true; setBusy(true); setError(''); setMessage('')
    const original = originalRef.current || { fleetId: saved.fleetId, expectedUpdatedAt: saved.updatedAt, logoIcon, logoColor: normalizeStoreLogoColor(logoColor), expectedActorId: saved.actorId, idempotencyKey: crypto.randomUUID() }
    try {
      const key = `openfront-rideshare-branding-command-v1:${saved.actorId}:${saved.fleetId}`
      const serialized = JSON.stringify(original)
      sessionStorage.setItem(key, serialized)
      if (sessionStorage.getItem(key) !== serialized) throw new Error()
      originalRef.current = original; setUncertain(true)
      const data = await graphql(`mutation SaveFleetLogo($fleetId: ID!, $expectedUpdatedAt: DateTime!, $logoIcon: String!, $logoColor: String!, $idempotencyKey: String!, $expectedActorId: ID!) { saveFleetBranding(fleetId: $fleetId, expectedUpdatedAt: $expectedUpdatedAt, logoIcon: $logoIcon, logoColor: $logoColor, idempotencyKey: $idempotencyKey, expectedActorId: $expectedActorId) }`, original)
      const row = data.saveFleetBranding
      if (row?.fleetId !== original.fleetId || row.logoColor !== original.logoColor || typeof row.logoIcon !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error()
      const acknowledgement = JSON.stringify({ original, result: row })
      const acknowledgementKey = `${key}:ack:${original.idempotencyKey}`
      sessionStorage.setItem(acknowledgementKey, acknowledgement)
      if (sessionStorage.getItem(acknowledgementKey) !== acknowledgement) throw new Error()
      originalRef.current = null
      setSaved(row); setLogoIcon(row.logoIcon); setLogoColor(row.logoColor); setUncertain(false); setMessage('Logo saved')
      sessionStorage.removeItem(key)
    } catch { setError('Save unconfirmed. Your draft is kept; recover the save.') }
    finally { flight.current = false; setBusy(false) }
  }
  const fleetName = fleets.find(fleet => fleet.id === fleetId)?.name || saved?.name || ''
  const svgSrc = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`
  return <PlatformSection id="branding" title="Storefront logo" meta={uncertain ? <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><StatusDot tone="amber" />Save unconfirmed</span> : dirty ? <span className="inline-flex items-center gap-1.5"><StatusDot tone="blue" />Unsaved</span> : undefined}>
    <div className="min-w-0 space-y-5 rounded-xl border bg-card p-4 md:p-5" data-unsaved={dirty || uncertain ? 'true' : undefined}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="branding-fleet">Fleet</Label><select id="branding-fleet" value={fleetId} disabled={busy || uncertain} className="h-10 w-full min-w-0 rounded-xl border bg-background px-3 text-sm" onChange={event => { if (dirty && !window.confirm('Discard unsaved branding changes?')) return; setFleetId(event.target.value); setSaved(null); if (event.target.value) void read(event.target.value) }}><option value="">Choose a fleet</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}</select></div>
        {after && <ActionTrack><TrackButton size="md" onClick={() => void loadFleets(after)}>More fleets</TrackButton></ActionTrack>}
      </div>
      {saved && <>
        <div className="flex items-center gap-4 rounded-xl bg-zinc-950 p-4 text-zinc-50">
          <img alt="" className="size-11 shrink-0" src={svgSrc(logoIcon)} style={{ filter: `hue-rotate(${normalizeStoreLogoColor(logoColor)}deg)` }} />
          <div className="min-w-0"><p className="truncate font-semibold">{fleetName}</p><p className="text-xs text-zinc-400">Storefront preview</p></div>
        </div>
        <fieldset disabled={busy || uncertain} className="min-w-0 space-y-5">
          <legend className="sr-only">Logo</legend>
          <div role="radiogroup" aria-label="Logo mark" className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5 lg:grid-cols-6">{LOGO_ICONS.map(icon => <button type="button" role="radio" key={icon.id} aria-checked={logoIcon === icon.lightSvg} onClick={() => setLogoIcon(icon.lightSvg)} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border p-2.5 text-[0.6875rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${logoIcon === icon.lightSvg ? 'border-foreground bg-muted font-medium' : 'hover:bg-muted/60'}`}><img alt="" className="size-8" src={svgSrc(icon.lightSvg)} style={{ filter: `hue-rotate(${normalizeStoreLogoColor(logoColor)}deg)` }} /><span className="w-full truncate text-center">{icon.name}</span></button>)}</div>
          <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="fleet-logo-hue">Hue</Label><span className="text-xs tabular-nums text-muted-foreground">{normalizeStoreLogoColor(logoColor)}°</span></div><input id="fleet-logo-hue" type="range" min={0} max={359} step={1} value={Number(normalizeStoreLogoColor(logoColor))} onChange={event => setLogoColor(event.target.value)} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(90deg,#155eef,#7a5af8,#dd2590,#f04438,#f79009,#66c61c,#06aed4,#155eef)] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow" /></div>
          <details className="group rounded-xl border px-3 py-2"><summary className="cursor-pointer text-sm font-medium">Custom SVG</summary><Label htmlFor="fleet-custom-svg" className="sr-only">Custom SVG</Label><textarea id="fleet-custom-svg" className="mt-2 min-h-32 w-full min-w-0 rounded-lg border bg-background p-3 font-mono text-xs" value={logoIcon} maxLength={100000} onChange={event => setLogoIcon(event.target.value)} /></details>
        </fieldset>
        <div className="sticky bottom-3 z-10 flex justify-end"><ActionTrack className="shadow-lg">
          <TrackButton size="md" disabled={busy} onClick={() => { if (dirty && !window.confirm('Reload current branding? Unsaved changes are discarded.')) return; void read(saved.fleetId) }}>Reload</TrackButton>
          <TrackButton tone="primary" size="md" disabled={busy || (!dirty && !uncertain)} onClick={() => void save()}>{busy ? 'Saving…' : uncertain ? 'Recover save' : 'Save logo'}</TrackButton>
        </ActionTrack></div>
      </>}
      {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </PlatformSection>
}
