'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActionTrack, TrackButton } from './PillTabs'

export type SetupField =
  | { name: string; label: string; type: 'text' | 'email' | 'date' | 'time'; required?: boolean; defaultValue?: string; maxLength?: number; placeholder?: string }
  | { name: string; label: string; type: 'number'; required?: boolean; defaultValue?: number; min?: number; max?: number }
  | { name: string; label: string; type: 'money'; currency: string; required?: boolean; defaultValue?: number }
  | { name: string; label: string; type: 'textarea'; defaultValue?: string; maxLength?: number }
  | { name: string; label: string; type: 'select'; options: Array<{ value: string; label: string }>; required?: boolean; defaultValue?: string }
  | { name: string; label: string; type: 'checkbox'; defaultValue?: boolean }
  | { name: string; label: string; type: 'multi'; options: Array<{ value: string; label: string }>; required?: boolean; defaultValue?: string[] }

/** POSTs to the GraphQL API from the browser so setup errors keep their readable message. */
export async function platformGraphql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ query, variables }) })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.errors?.length || !payload?.data) throw new Error(payload?.errors?.[0]?.message && payload.errors[0].message !== 'Unexpected error.' ? payload.errors[0].message : 'That did not save. Check the details and try again.')
  return payload.data as T
}

const input = 'h-10 w-full min-w-0 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** A right-hand drawer with a validated form. `onSubmit` receives typed values (money in minor units). */
export function SetupSheet({ trigger, title, fields, submitLabel, onSubmit, tone = 'primary' }: {
  trigger: string | ReactNode
  title: string
  fields: SetupField[]
  submitLabel: string
  onSubmit: (values: Record<string, any>) => Promise<unknown>
  tone?: 'primary' | 'default'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const values: Record<string, any> = {}
    for (const field of fields) {
      if (field.type === 'checkbox') values[field.name] = form.get(field.name) === 'on'
      else if (field.type === 'multi') values[field.name] = form.getAll(field.name).map(String)
      else if (field.type === 'number') { const raw = String(form.get(field.name) ?? '').trim(); values[field.name] = raw === '' ? null : Number(raw) }
      else if (field.type === 'money') { const raw = String(form.get(field.name) ?? '').trim(); values[field.name] = raw === '' ? 0 : Math.round(Number(raw) * 100) }
      else values[field.name] = String(form.get(field.name) ?? '').trim()
      if ('required' in field && field.required && (values[field.name] === '' || values[field.name] === null || (Array.isArray(values[field.name]) && !values[field.name].length))) { setError(`${field.label} is required.`); return }
      if (field.type === 'money' && (!Number.isFinite(values[field.name]) || values[field.name] < 0)) { setError(`${field.label} must be zero or more.`); return }
    }
    setBusy(true); setError('')
    try { await onSubmit(values); setOpen(false); router.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'That did not save.') }
    finally { setBusy(false) }
  }
  return <>
    <ActionTrack><TrackButton tone={tone} onClick={() => { setError(''); setOpen(true) }}>{trigger}</TrackButton></ActionTrack>
    <Sheet open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5"><SheetTitle>{title}</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="flex flex-1 flex-col" data-unsaved={open ? 'true' : undefined}>
          <fieldset disabled={busy} className="flex-1 space-y-4 p-5">
            {fields.map(field => <div key={field.name} className="space-y-1.5">
              {field.type === 'checkbox'
                ? <label className="flex min-h-10 items-center gap-3 text-sm font-medium"><input type="checkbox" name={field.name} defaultChecked={field.defaultValue} className="size-4 accent-foreground" />{field.label}</label>
                : <label className="block space-y-1.5"><span className="text-sm font-medium">{field.label}{'required' in field && field.required ? '' : <span className="font-normal text-muted-foreground"> · optional</span>}</span>
                  {field.type === 'select' ? <select name={field.name} defaultValue={field.defaultValue} className={input}>{!field.required && <option value="">None</option>}{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    : field.type === 'multi' ? <span className="block max-h-48 space-y-1 overflow-y-auto rounded-xl border p-2">{field.options.length ? field.options.map(option => <span key={option.value} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"><input type="checkbox" name={field.name} value={option.value} defaultChecked={field.defaultValue?.includes(option.value)} className="size-4 accent-foreground" />{option.label}</span>) : <span className="block px-2 py-1.5 text-sm text-muted-foreground">Nothing to choose yet</span>}</span>
                    : field.type === 'textarea' ? <textarea name={field.name} defaultValue={field.defaultValue} maxLength={field.maxLength} className={`${input} h-24 py-2`} />
                    : field.type === 'money' ? <span className="relative block"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{field.currency}</span><input name={field.name} type="number" inputMode="decimal" min={0} step="0.01" defaultValue={field.defaultValue !== undefined ? (field.defaultValue / 100).toFixed(2) : ''} required={field.required} className={`${input} pl-12 tabular-nums`} /></span>
                    : field.type === 'number' ? <input name={field.name} type="number" inputMode="numeric" min={field.min} max={field.max} defaultValue={field.defaultValue} required={field.required} className={`${input} tabular-nums`} />
                    : <input name={field.name} type={field.type} defaultValue={field.defaultValue} maxLength={'maxLength' in field ? field.maxLength : undefined} placeholder={'placeholder' in field ? field.placeholder : undefined} required={field.required} className={input} />}
                </label>}
            </div>)}
            {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </fieldset>
          <div className="sticky bottom-0 flex justify-end border-t bg-background p-4"><ActionTrack><TrackButton size="md" disabled={busy} onClick={() => setOpen(false)}>Cancel</TrackButton><TrackButton type="submit" tone="primary" size="md" disabled={busy}>{busy ? 'Saving…' : submitLabel}</TrackButton></ActionTrack></div>
        </form>
      </SheetContent>
    </Sheet>
  </>
}

/** One-click transition buttons (approve, pause…) with the server's reason shown on failure. */
export function TransitionTrack({ label, actions }: { label: string; actions: Array<{ label: string; tone?: 'primary' | 'default' | 'danger' | 'quiet'; run: () => Promise<unknown>; confirm?: string }> }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  return <div className="space-y-1.5">
    <ActionTrack label={label}>{actions.map(action => <TrackButton key={action.label} tone={action.tone || 'default'} disabled={Boolean(busy)} onClick={async () => {
      if (action.confirm && !window.confirm(action.confirm)) return
      setBusy(action.label); setError('')
      try { await action.run(); router.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'That did not save.') } finally { setBusy('') }
    }}>{busy === action.label ? 'Saving…' : action.label}</TrackButton>)}</ActionTrack>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
