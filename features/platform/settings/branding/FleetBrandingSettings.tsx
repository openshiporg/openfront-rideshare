'use client'
import { useEffect, useRef, useState } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusDot } from '@/features/platform/components/StatusTitle'
import { HUE_PRESETS, LOGO_ICONS } from './icon-registry'
import { StoreSettingsSaveBar } from './StoreSettingsSaveBar'
import { normalizeStoreLogoColor } from './store-logo'

type Branding = { actorId: string; fleetId: string; name: string; logoIcon: string; logoColor: string; updatedAt: string }
export function FleetBrandingSettings() {
  const [fleets, setFleets] = useState<Array<{ id: string; name: string }>>([])
  const [after, setAfter] = useState<string | null>(null)
  const [fleetId, setFleetId] = useState('')
  const [saved, setSaved] = useState<Branding | null>(null)
  const [name, setName] = useState('')
  const [logoIcon, setLogoIcon] = useState('')
  const [logoColor, setLogoColor] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const originalRef = useRef<Record<string, any> | null>(null)
  const flight = useRef(false)
  const generation = useRef(0)
  const dirty = Boolean(saved && (name.trim() !== saved.name || logoIcon !== saved.logoIcon || logoColor !== saved.logoColor))
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
      // With a single fleet there is nothing to choose; open its logo straight away.
      if (!cursor && rows.length === 1 && data.fleets.length === 1) { setFleetId(rows[0].id); void read(rows[0].id) }
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
        setSaved(row); setName(original?.name ?? row.name); setLogoIcon(original?.logoIcon ?? row.logoIcon); setLogoColor(original?.logoColor ?? row.logoColor); setUncertain(Boolean(original))
        if (original) setMessage('Last save unconfirmed. Recover it before editing.')
      }
    } catch { if (current === generation.current) { setSaved(null); setError('Branding unavailable. Nothing was saved.') } }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function save() {
    if (!saved || flight.current || !dirty && !originalRef.current) return
    flight.current = true; setBusy(true); setError(''); setMessage('')
    const original = originalRef.current || { fleetId: saved.fleetId, expectedUpdatedAt: saved.updatedAt, name: name.trim(), logoIcon, logoColor: normalizeStoreLogoColor(logoColor), expectedActorId: saved.actorId, idempotencyKey: crypto.randomUUID() }
    try {
      const key = `openfront-rideshare-branding-command-v1:${saved.actorId}:${saved.fleetId}`
      const serialized = JSON.stringify(original)
      sessionStorage.setItem(key, serialized)
      if (sessionStorage.getItem(key) !== serialized) throw new Error()
      originalRef.current = original; setUncertain(true)
      const data = await graphql(`mutation SaveFleetLogo($fleetId: ID!, $expectedUpdatedAt: DateTime!, $logoIcon: String!, $logoColor: String!, $name: String, $idempotencyKey: String!, $expectedActorId: ID!) { saveFleetBranding(fleetId: $fleetId, expectedUpdatedAt: $expectedUpdatedAt, logoIcon: $logoIcon, logoColor: $logoColor, name: $name, idempotencyKey: $idempotencyKey, expectedActorId: $expectedActorId) }`, original)
      const row = data.saveFleetBranding
      if (row?.fleetId !== original.fleetId || row.logoColor !== original.logoColor || (original.name !== undefined && row.name !== original.name) || typeof row.logoIcon !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error()
      const acknowledgement = JSON.stringify({ original, result: row })
      const acknowledgementKey = `${key}:ack:${original.idempotencyKey}`
      sessionStorage.setItem(acknowledgementKey, acknowledgement)
      if (sessionStorage.getItem(acknowledgementKey) !== acknowledgement) throw new Error()
      originalRef.current = null
      setSaved(row); setName(row.name); setLogoIcon(row.logoIcon); setLogoColor(row.logoColor); setUncertain(false); setMessage('Settings saved')
      sessionStorage.removeItem(key)
    } catch { setError('Save unconfirmed. Your draft is kept; recover the save.') }
    finally { flight.current = false; setBusy(false) }
  }
  // Same names as the E-commerce logo block, over this page's form state.
  const selectedIcon = LOGO_ICONS.find((icon) => icon.lightSvg === logoIcon)
  const reload = () => { if (!saved) return; if (dirty && !window.confirm('Reload current branding? Unsaved changes are discarded.')) return; void read(saved.fleetId) }
  return <PlatformSection id="branding" title="Store settings" meta={uncertain ? <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><StatusDot tone="amber" />Save unconfirmed</span> : dirty ? <span className="inline-flex items-center gap-1.5"><StatusDot tone="blue" />Unsaved</span> : undefined}>
    <div className="min-w-0 space-y-5 rounded-[6px] border bg-card p-4 md:p-5" data-unsaved={dirty || uncertain ? 'true' : undefined}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="branding-fleet">Fleet</Label><select id="branding-fleet" value={fleetId} disabled={busy || uncertain} className="h-10 w-full min-w-0 rounded-[6px] border bg-background px-3 text-sm" onChange={event => { if (dirty && !window.confirm('Discard unsaved branding changes?')) return; setFleetId(event.target.value); setSaved(null); if (event.target.value) void read(event.target.value) }}><option value="">Choose a fleet</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.name}</option>)}</select></div>
        {after && <ActionTrack><TrackButton size="md" onClick={() => void loadFleets(after)}>More fleets</TrackButton></ActionTrack>}
      </div>
      {saved && <>
        <fieldset disabled={busy || uncertain} className="min-w-0 space-y-6">
          <legend className="sr-only">Store settings</legend>
          <div className="space-y-1.5"><Label htmlFor="fleet-name">Fleet name</Label><Input id="fleet-name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /></div>
                  {/* Logo Icon Selector */}
                  <div>
                    <Label>Logo Icon</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Select
                        value={selectedIcon?.id || ''}
                        onValueChange={(id) => {
                          const icon = LOGO_ICONS.find((i) => i.id === id);
                          if (icon) setLogoIcon(icon.lightSvg);
                        }}
                      >
                        <SelectPrimitive.Trigger
                          className={cn(
                            'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                          )}
                        >
                          <div
                            dangerouslySetInnerHTML={{ __html: logoIcon }}
                            style={{ filter: `hue-rotate(${logoColor}deg)` }}
                            className="[&>svg]:w-6 [&>svg]:h-6"
                          />
                        </SelectPrimitive.Trigger>
                        <SelectContent className="border-border dark:border-blue-700">
                          {LOGO_ICONS.map((icon) => (
                            <SelectItem key={icon.id} value={icon.id}>
                              <span className="flex items-center gap-3">
                                <div
                                  dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                                  style={{ filter: `hue-rotate(${logoColor}deg)` }}
                                  className="[&>svg]:w-6 [&>svg]:h-6"
                                />
                                <span>
                                  <span className="block font-medium text-gray-900 dark:text-gray-100">
                                    {icon.name}
                                  </span>
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* SVG Code Editor Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-12 w-12 shrink-0"
                            type="button"
                          >
                            <Code className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[min(500px,calc(100vw-2rem))]" align="start">
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium mb-2">Edit SVG Code</h4>
                              <p className="text-sm text-muted-foreground mb-4">
                                Edit the SVG code directly. Changes will be reflected in the icon preview.
                              </p>
                            </div>
                            <Textarea
                              value={logoIcon}
                              onChange={(e) => setLogoIcon(e.target.value)}
                              className="font-mono text-xs min-h-[300px]"
                              placeholder="<svg>...</svg>"
                            />
                            <div className="flex items-center gap-2">
                              <div className="text-sm text-muted-foreground">Preview:</div>
                              <div
                                dangerouslySetInnerHTML={{ __html: logoIcon }}
                                style={{ filter: `hue-rotate(${logoColor}deg)` }}
                                className="[&>svg]:w-8 [&>svg]:h-8 flex items-center justify-center p-2 border rounded"
                              />
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Logo Color Selector */}
                  <div>
                    <Label>Logo Color</Label>
                    <div className="mt-2">
                      <Select
                        value={logoColor}
                        onValueChange={(value) => setLogoColor(value)}
                      >
                        <SelectPrimitive.Trigger
                          className={cn(
                            'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                          )}
                        >
                          <SelectValue>
                            <div
                              className="w-6 h-6 rounded-full"
                              style={{
                                background: `hsl(${(240 + parseInt(logoColor)) % 360}, 70%, 50%)`
                              }}
                            />
                          </SelectValue>
                        </SelectPrimitive.Trigger>
                        <SelectContent className="border-border dark:border-blue-700">
                          <div className="grid grid-cols-4 gap-2 p-2">
                            {HUE_PRESETS.map((preset) => (
                              <SelectItem
                                key={preset.value}
                                value={preset.value.toString()}
                                className="cursor-pointer p-0 h-12 w-12 flex items-center justify-center [&>span:first-child]:hidden"
                              >
                                <div
                                  className="w-6 h-6 rounded-full"
                                  style={{
                                    background: `hsl(${(240 + preset.value) % 360}, 70%, 50%)`
                                  }}
                                />
                              </SelectItem>
                            ))}
                          </div>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
        </fieldset>
        <StoreSettingsSaveBar isSaving={busy} status={message || null} button={<ActionTrack>
          <TrackButton size="md" disabled={busy} onClick={reload}>Reload</TrackButton>
          <TrackButton tone="primary" size="md" disabled={busy || !name.trim() || (!dirty && !uncertain)} onClick={() => void save()}>{busy ? 'Saving…' : uncertain ? 'Recover save' : 'Save settings'}</TrackButton>
        </ActionTrack>} />
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </PlatformSection>
}
