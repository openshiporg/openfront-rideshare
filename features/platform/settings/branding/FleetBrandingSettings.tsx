'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
    } catch { setError('Fleet settings are unavailable or outside your current owner access.') }
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
        if (original) setMessage('Current branding loaded. The original save remains unresolved; recover it before editing.')
      }
    } catch { if (current === generation.current) { setSaved(null); setError('Current fleet branding is unavailable. No save was sent.') } }
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
      setSaved(row); setLogoIcon(row.logoIcon); setLogoColor(row.logoColor); setUncertain(false); setMessage('Branding save acknowledged.')
      sessionStorage.removeItem(key)
    } catch { setError('Save outcome is unconfirmed. The original draft is retained. Read current branding before another save.') }
    finally { flight.current = false; setBusy(false) }
  }
  return <section className="min-w-0 space-y-4 rounded-xl border p-4" data-unsaved={dirty || uncertain ? 'true' : undefined}><h2 className="font-semibold">Fleet storefront branding</h2><Label htmlFor="branding-fleet">Fleet</Label><select id="branding-fleet" value={fleetId} disabled={busy || uncertain} className="h-10 w-full min-w-0 rounded-md border bg-background px-3" onChange={event => { if (dirty && !window.confirm('Discard unsaved branding changes?')) return; setFleetId(event.target.value); setSaved(null); if (event.target.value) void read(event.target.value) }}><option value="">Choose a fleet you own</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}</select>{after && <Button type="button" size="sm" variant="outline" onClick={() => void loadFleets(after)}>More fleets</Button>}{saved && <><fieldset disabled={busy || uncertain} className="space-y-4"><legend className="text-sm font-medium">Choose a logo</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LOGO_ICONS.map(icon => <button type="button" key={icon.id} aria-pressed={logoIcon === icon.lightSvg} onClick={() => setLogoIcon(icon.lightSvg)} className={`min-w-0 rounded-lg border p-3 text-xs focus-visible:outline focus-visible:outline-2 ${logoIcon === icon.lightSvg ? 'border-primary bg-primary/5' : ''}`}><img alt="" className="mx-auto mb-2 size-9" src={`data:image/svg+xml,${encodeURIComponent(icon.lightSvg)}`} />{icon.name}</button>)}</div><div><Label htmlFor="fleet-logo-hue">Logo hue</Label><Input id="fleet-logo-hue" type="number" value={logoColor} onChange={event => setLogoColor(event.target.value)} onBlur={() => setLogoColor(normalizeStoreLogoColor(logoColor))} /></div><div><Label htmlFor="fleet-custom-svg">Custom SVG</Label><textarea id="fleet-custom-svg" className="mt-1 min-h-32 w-full min-w-0 rounded-md border bg-background p-3 font-mono text-xs" value={logoIcon} maxLength={100000} onChange={event => setLogoIcon(event.target.value)} /></div></fieldset><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy || (!dirty && !uncertain)} onClick={() => void save()}>{busy ? 'Working…' : uncertain ? 'Recover original branding save' : 'Save branding'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { if (dirty && !window.confirm('Read current branding? The original submitted draft remains saved for reconciliation.')) return; void read(saved.fleetId) }}>Read current branding</Button></div></>}{message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>
}
