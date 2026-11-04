'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Building2, MapPin, Plane, Ship, TrainFront } from 'lucide-react'
import type { LngLat } from './RideMap'

export type PlaceSuggestion = { label: string; name: string; detail: string; point: LngLat; kind: string }

export function PlaceKindIcon({ kind, label, className }: { kind?: string; label?: string; className?: string }) {
  const text = `${kind || ''} ${label || ''}`
  if (/aerodrome|airport|terminal \d/i.test(text)) return <Plane className={className} />
  if (/ferry|pier|wharf|harbou?r terminal|dock|marina/i.test(text)) return <Ship className={className} />
  if (/station|halt|tram|subway|train/i.test(text)) return <TrainFront className={className} />
  if (/house|building|office|commercial|retail|apartments/i.test(text)) return <Building2 className={className} />
  return <MapPin className={className} />
}

/**
 * A pickup or destination field with live place suggestions (OpenStreetMap via the store's /api/places
 * proxy: 3+ characters, 300 ms after typing stops, stale answers dropped). Typing frees the field;
 * choosing a suggestion pins its point on the map.
 */
export function PlaceField({ id, value, onChange, onPick, near, placeholder, label, inputClassName, className, onFocus, children, leading, disabled, required, autoFocus }: {
  id: string
  value: string
  onChange: (value: string) => void
  onPick: (place: PlaceSuggestion) => void
  near: LngLat | null
  placeholder: string
  label: string
  inputClassName?: string
  className?: string
  onFocus?: () => void
  children?: React.ReactNode
  leading?: React.ReactNode
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
}) {
  const listId = useId()
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [state, setState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle')
  const typed = useRef(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typed.current) return
    const query = value.trim()
    if (query.length < 3) { setResults([]); setState('idle'); return }
    const controller = new AbortController()
    setState('loading')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}${near ? `&near=${near.join(',')}` : ''}`, { signal: controller.signal })
        const payload = response.ok ? await response.json() : null
        const places = Array.isArray(payload?.places) ? payload.places.slice(0, 6) as PlaceSuggestion[] : []
        setResults(places); setActive(-1); setState(response.ok ? places.length ? 'idle' : 'none' : 'error')
      } catch { if (!controller.signal.aborted) setState('error') }
    }, 300)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [value, near])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (place: PlaceSuggestion) => { typed.current = false; setOpen(false); setResults([]); setState('idle'); onPick(place) }
  const showList = open && value.trim().length >= 3 && (results.length > 0 || state !== 'idle')

  return <div ref={wrapper} className={`relative ${className || ''}`}>
    <div className="flex min-w-0 items-center gap-2.5">
      {leading}
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        name={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        required={required}
        minLength={required ? 2 : undefined}
        maxLength={120}
        onFocus={() => { setOpen(true); onFocus?.() }}
        onChange={event => { typed.current = true; setOpen(true); onChange(event.target.value) }}
        onKeyDown={event => {
          if (!showList) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, results.length - 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, -1)) }
          else if (event.key === 'Enter' && active >= 0 && results[active]) { event.preventDefault(); pick(results[active]) }
          else if (event.key === 'Escape') { setOpen(false) }
        }}
        className={inputClassName}
      />
      {children}
    </div>
    {showList && <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-18px_rgba(11,43,46,0.5)] ring-1 ring-ink/10">
      <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-[min(20rem,45dvh)] divide-y divide-border overflow-y-auto overscroll-contain" data-sheet-no-drag>
        {results.map((place, index) => <li key={`${place.label}:${index}`} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          onPointerDown={event => event.preventDefault()}
          onClick={() => pick(place)}
          className="flex cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-foam hover:bg-foam">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef3f3] text-ink"><PlaceKindIcon kind={place.kind} label={place.name} className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[0.9375rem] font-medium text-ink">{place.name}</span>{place.detail && <span className="block truncate text-[0.8125rem] text-muted-foreground">{place.detail}</span>}</span>
        </li>)}
      </ul>
      {state === 'loading' && !results.length && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>}
      {state === 'none' && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">No matching places</p>}
      {state === 'error' && <p role="status" className="px-4 py-3 text-sm text-amber-700">Place search unavailable</p>}
    </div>}
  </div>
}
