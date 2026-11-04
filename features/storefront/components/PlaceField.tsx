'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Building2, MapPin, Plane, Ship, TrainFront } from 'lucide-react'
import type { LngLat } from './RideMap'

export type PlaceSuggestion = { label: string; name: string; detail: string; point: LngLat; kind: string }
/** A row shown at once, before (or instead of) place search: an action ("Set on map") or a known place.
 * With `match`, it shows while the typed text is part of it; without, only before typing. */
export type QuickRow = { key: string; title: string; detail?: string; icon: React.ReactNode; match?: string; onSelect: () => void }

// Answers already fetched in this tab, so retyping or going back is instant.
const answers = new Map<string, PlaceSuggestion[]>()

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
 * proxy: 3+ characters, 200 ms after typing stops, stale answers dropped, earlier answers kept until the
 * next arrive). Quick rows (current location, set on map, recent places) show at once. Typing frees the
 * field; choosing a suggestion pins its point on the map.
 */
export function PlaceField({ id, value, onChange, onPick, near, placeholder, label, inputClassName, className, onFocus, children, leading, disabled, required, autoFocus, quick = [] }: {
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
  quick?: QuickRow[]
}) {
  const listId = useId()
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [state, setState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle')
  // Actions (current location, set on map) show until the rider starts typing in this visit to the field.
  const [typing, setTyping] = useState(false)
  const typed = useRef(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!typed.current) return
    const query = value.trim()
    if (query.length < 3) { setResults([]); setState('idle'); return }
    const key = `${query.toLowerCase()}|${near?.map(value => value.toFixed(2)).join(',') || ''}`
    const known = answers.get(key)
    if (known) { setResults(known); setState(known.length ? 'idle' : 'none'); return }
    const controller = new AbortController()
    setState('loading')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}${near ? `&near=${near.join(',')}` : ''}`, { signal: controller.signal })
        // Busy upstream: keep what's shown; the next keystroke asks again.
        if (response.status === 503) { setState('idle'); return }
        const payload = response.ok ? await response.json() : null
        const places = Array.isArray(payload?.places) ? payload.places.slice(0, 6) as PlaceSuggestion[] : []
        if (response.ok) answers.set(key, places)
        setResults(places); setActive(-1); setState(response.ok ? places.length ? 'idle' : 'none' : 'error')
      } catch { if (!controller.signal.aborted) setState('error') }
    }, 200)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [value, near])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (place: PlaceSuggestion) => { typed.current = false; setOpen(false); setResults([]); setState('idle'); onPick(place) }
  const query = value.trim().toLowerCase()
  const searched = query.length >= 3
  const browsing = !query || !typing
  const quickRows = quick.filter(row => row.match ? (browsing ? row.match.toLowerCase() !== query : row.match.toLowerCase().includes(query) && row.match.toLowerCase() !== query) : browsing).slice(0, browsing ? 6 : 3)
  const rows = [...quickRows.map(row => ({ quick: row })), ...(searched && typing ? results : []).map(place => ({ place }))] as Array<{ quick: QuickRow; place?: undefined } | { place: PlaceSuggestion; quick?: undefined }>
  const choose = (row: (typeof rows)[number]) => { if (row.quick) { typed.current = false; setOpen(false); row.quick.onSelect() } else pick(row.place) }
  const showList = open && !disabled && (rows.length > 0 || (searched && typing && state !== 'idle'))

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
        onFocus={() => { setOpen(true); setTyping(false); onFocus?.() }}
        onChange={event => { typed.current = true; setTyping(true); setOpen(true); onChange(event.target.value) }}
        onKeyDown={event => {
          if (!showList) return
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, rows.length - 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, -1)) }
          else if (event.key === 'Enter' && active >= 0 && rows[active]) { event.preventDefault(); choose(rows[active]) }
          else if (event.key === 'Escape') { setOpen(false) }
        }}
        className={inputClassName}
      />
      {children}
    </div>
    {showList && <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-18px_rgba(11,43,46,0.5)] ring-1 ring-ink/10">
      <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-[min(20rem,45dvh)] divide-y divide-border overflow-y-auto overscroll-contain" data-sheet-no-drag>
        {rows.map((row, index) => <li key={row.quick ? `q:${row.quick.key}` : `${row.place.label}:${index}`} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          onPointerDown={event => event.preventDefault()}
          onClick={() => choose(row)}
          className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 aria-selected:bg-foam hover:bg-foam">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef3f3] text-ink">{row.quick ? row.quick.icon : <PlaceKindIcon kind={row.place.kind} label={row.place.name} className="size-4" />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[0.9375rem] font-medium text-ink">{row.quick ? row.quick.title : row.place.name}</span>{(row.quick ? row.quick.detail : row.place.detail) && <span className="block truncate text-[0.8125rem] text-muted-foreground">{row.quick ? row.quick.detail : row.place.detail}</span>}</span>
        </li>)}
      </ul>
      {searched && typing && state === 'loading' && <p role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-tide/30 border-t-tide motion-reduce:animate-none" />Searching places…</p>}
      {searched && typing && state === 'none' && <p role="status" className="px-4 py-3 text-sm text-muted-foreground">No matching places</p>}
      {searched && typing && state === 'error' && <p role="status" className="px-4 py-3 text-sm text-amber-700">Place search unavailable</p>}
    </div>}
  </div>
}
