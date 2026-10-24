'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { SetupSheet, TransitionTrack, type SetupField } from '@/features/platform/components/SetupSheet'
import { DOCUMENT_KIND_OPTIONS, setup, toDocumentInput } from '@/features/platform/setup/setupMutations'

export function AddDriverSheet({ fleets }: { fleets: Array<{ id: string; name: string }> }) {
  if (!fleets.length) return null
  const fields: SetupField[] = [
    ...(fleets.length > 1 ? [{ name: 'fleetId', label: 'Fleet', type: 'select' as const, required: true, options: fleets.map(fleet => ({ value: fleet.id, label: fleet.name })) }] : []),
    { name: 'publicName', label: 'Name riders see', type: 'text', required: true, maxLength: 80, placeholder: 'Maya R.' },
    { name: 'email', label: 'Driver account email', type: 'email' },
    { name: 'acceptsScheduled', label: 'Takes scheduled rides', type: 'checkbox', defaultValue: true },
  ]
  return <SetupSheet trigger="Add driver" title="Add driver" submitLabel="Add driver" fields={fields} onSubmit={values => setup.driver({ ...values, fleetId: values.fleetId || fleets[0].id, email: values.email || null })} />
}

export function DriverReviewTrack({ driverId, status }: { driverId: string; status: string }) {
  const actions = [
    ...(status !== 'active' ? [{ label: 'Approve', tone: 'primary' as const, run: () => setup.reviewDriver(driverId, 'active') }] : []),
    ...(status === 'active' ? [{ label: 'Pause', run: () => setup.reviewDriver(driverId, 'paused') }] : []),
    ...(status !== 'ineligible' && status !== 'offboarded' ? [{ label: 'Mark ineligible', tone: 'danger' as const, run: () => setup.reviewDriver(driverId, 'ineligible'), confirm: 'Mark this driver ineligible? They stop receiving offers.' }] : []),
    ...(status !== 'offboarded' ? [{ label: 'Offboard', tone: 'quiet' as const, run: () => setup.reviewDriver(driverId, 'offboarded'), confirm: 'Offboard this driver?' }] : []),
  ]
  return <TransitionTrack label="Driver review" actions={actions} />
}

export function AddDocumentSheet({ driverId, vehicleId, kinds }: { driverId?: string; vehicleId?: string; kinds: string[] }) {
  return <SetupSheet trigger="Add document" tone="default" title="Add document" submitLabel="Add document" onSubmit={values => setup.document(toDocumentInput({ ...values, driverId: driverId || null, vehicleId: vehicleId || null }))} fields={[
    { name: 'kind', label: 'Document', type: 'select', required: true, defaultValue: kinds[0], options: DOCUMENT_KIND_OPTIONS.filter(option => kinds.includes(option.value) || option.value === 'other') },
    { name: 'issuer', label: 'Issued by', type: 'text', maxLength: 120 },
    { name: 'referenceMasked', label: 'Reference (last 4)', type: 'text', maxLength: 40 },
    { name: 'issuedAt', label: 'Issued', type: 'date' },
    { name: 'expiresAt', label: 'Expires', type: 'date' },
  ]} />
}

export function DocumentReviewTrack({ documentId, status }: { documentId: string; status: string }) {
  if (status === 'accepted_evidence') return <TransitionTrack label="Document review" actions={[{ label: 'Revoke', tone: 'quiet', run: () => setup.reviewDocument(documentId, 'revoked'), confirm: 'Revoke this document?' }]} />
  if (!['submitted', 'under_review'].includes(status)) return null
  return <TransitionTrack label="Document review" actions={[{ label: 'Accept', tone: 'primary', run: () => setup.reviewDocument(documentId, 'accepted_evidence') }, { label: 'Reject', tone: 'danger', run: () => setup.reviewDocument(documentId, 'rejected_evidence') }]} />
}

export function AddVehicleSheet({ fleetId, driverId }: { fleetId: string; driverId?: string }) {
  return <SetupSheet trigger="Add vehicle" tone="default" title="Add vehicle" submitLabel="Add vehicle" onSubmit={values => setup.vehicle({ ...values, fleetId, driverIds: driverId ? [driverId] : [] })} fields={[
    { name: 'label', label: 'Name', type: 'text', required: true, maxLength: 80, placeholder: 'Blue 2022 Hybrid' },
    { name: 'make', label: 'Make', type: 'text', maxLength: 60 },
    { name: 'model', label: 'Model', type: 'text', maxLength: 60 },
    { name: 'year', label: 'Year', type: 'number', min: 1980, max: new Date().getFullYear() + 1 },
    { name: 'color', label: 'Colour', type: 'text', maxLength: 40 },
    { name: 'plateMasked', label: 'Plate (shown to riders)', type: 'text', maxLength: 20 },
    { name: 'capacity', label: 'Passenger seats', type: 'number', required: true, min: 1, max: 50, defaultValue: 4 },
    { name: 'wheelchairAccessible', label: 'Wheelchair accessible', type: 'checkbox' },
  ]} />
}

export function VehicleReviewTrack({ vehicleId, status }: { vehicleId: string; status: string }) {
  const actions = [
    ...(status !== 'active' && status !== 'retired' ? [{ label: 'Approve', tone: 'primary' as const, run: () => setup.reviewVehicle(vehicleId, 'active') }] : []),
    ...(status === 'active' ? [{ label: 'Maintenance', run: () => setup.reviewVehicle(vehicleId, 'maintenance') }] : []),
    ...(status !== 'retired' ? [{ label: 'Retire', tone: 'quiet' as const, run: () => setup.reviewVehicle(vehicleId, 'retired'), confirm: 'Retire this vehicle?' }] : []),
  ]
  return actions.length ? <TransitionTrack label="Vehicle review" actions={actions} /> : null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Weekly hours: one window per day, saved as a whole (earlier rules are paused server-side). */
export function AvailabilityEditor({ driverId, timezone, rules }: { driverId: string; timezone: string; rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> }) {
  const router = useRouter()
  const initial = DAYS.map((_, day) => { const rule = rules.find(item => item.dayOfWeek === day); return { on: Boolean(rule), start: rule?.startTime || '07:00', end: rule?.endTime || '19:00' } })
  const [days, setDays] = useState(initial)
  const [zone, setZone] = useState(timezone || 'UTC')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const dirty = JSON.stringify(days) !== JSON.stringify(initial) || zone !== (timezone || 'UTC')
  const update = (day: number, patch: Partial<typeof initial[number]>) => setDays(current => current.map((item, index) => index === day ? { ...item, ...patch } : item))
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try { await setup.availability(driverId, zone, days.flatMap((item, dayOfWeek) => item.on ? [{ dayOfWeek, startTime: item.start, endTime: item.end }] : [])); setMessage('Hours saved'); router.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Hours did not save.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3" data-unsaved={dirty ? 'true' : undefined}>
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">{days.map((item, day) => <li key={day} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <label className="flex w-20 items-center gap-2 font-medium"><input type="checkbox" checked={item.on} onChange={event => update(day, { on: event.target.checked })} className="size-4 accent-foreground" />{DAYS[day]}</label>
      {item.on ? <span className="flex items-center gap-2"><input type="time" aria-label={`${DAYS[day]} start`} value={item.start} onChange={event => update(day, { start: event.target.value })} className="h-9 rounded-lg border bg-background px-2 tabular-nums" /><span className="text-muted-foreground">–</span><input type="time" aria-label={`${DAYS[day]} end`} value={item.end} onChange={event => update(day, { end: event.target.value })} className="h-9 rounded-lg border bg-background px-2 tabular-nums" /></span> : <span className="text-muted-foreground">Off</span>}
    </li>)}</ul>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><span className="shrink-0 text-muted-foreground">Time zone</span><input value={zone} onChange={event => setZone(event.target.value)} maxLength={64} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2" /></label>
      <ActionTrack><TrackButton tone="primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Saving…' : 'Save hours'}</TrackButton></ActionTrack>
    </div>
    {message && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

/** Go online / offline. Without driverId it switches the signed-in driver (My driving). */
export function OnlineTrack({ dispatchStatus, driverId }: { dispatchStatus: string | null; driverId?: string }) {
  const online = dispatchStatus && dispatchStatus !== 'offline'
  if (dispatchStatus && !['offline', 'available'].includes(dispatchStatus)) return null
  return <TransitionTrack label="Presence" actions={online
    ? [{ label: 'Go offline', run: () => setup.online(false, driverId) }]
    : [{ label: 'Go online', tone: 'primary', run: () => setup.online(true, driverId) }]} />
}
