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
let warmed = false
function warm(near: LngLat | null) {
  if (warmed || !near) return
  warmed = true
  void fetch(`/api/places?warm=${near.join(',')}`).catch(() => { warmed = false })
}
const words = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean)
/** Every typed word starts a word of the place (so "del amo f" keeps "Del Amo Fashion Center"). */
export function placeMatches(text: string, query: string) {
  const have = words(text); const want = words(query)
  return want.length > 0 && want.every((word, index) => have.some(part => index === want.length - 1 ? part.startsWith(word) : part === word || part.startsWith(word)))
}
// Places this device picked before (labels and points only, from the open map data), newest first.
const recentKey = 'openfront-rideshare-recent-places-v1'
function recentPlaces(): PlaceSuggestion[] {
  try { const value = JSON.parse(localStorage.getItem(recentKey) || '[]'); return Array.isArray(value) ? value.filter(place => typeof place?.label === 'string' && typeof place?.name === 'string' && Array.isArray(place?.point)).slice(0, 12) : [] } catch { return [] }
}
function rememberPlace(place: PlaceSuggestion) {
  try { localStorage.setItem(recentKey, JSON.stringify([place, ...recentPlaces().filter(item => item.label !== place.label)].slice(0, 12))) } catch { /* optional */ }
}
/** Places already known on this device that still fit what's typed — shown while the search runs. */
function knownMatches(query: string, current: PlaceSuggestion[]) {
  const seen = new Set<string>(); const out: PlaceSuggestion[] = []
  for (const place of [...recentPlaces(), ...current, ...[...answers.values()].flat()]) {
    if (seen.has(place.label) || !placeMatches(`${place.name} ${place.detail}`, query)) continue
    seen.add(place.label); out.push(place); if (out.length >= 6) break
  }
  return out
}

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
 * proxy: 3+ characters; the first search starts at once, later ones 250 ms after typing pauses; earlier matches shown meanwhile; stale answers dropped, earlier answers kept until the
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
  const burst = useRef(0)
  const wrapper = useRef<HTMLDivElement>(null)

  // Searches in flight, by the text they asked for. One whose text is still the start of what's typed keeps
  // running (its answer is filtered down and shown); any other is stale and cancelled.
  const flights = useRef(new Map<string, AbortController>())
  const current = useRef('')
  useEffect(() => () => { for (const controller of flights.current.values()) controller.abort() }, [])
  // Warm the place search as soon as the sheet shows a place field (and again on focus, once per tab).
  useEffect(() => { if (!disabled) warm(near) }, [near, disabled])

  useEffect(() => {
    if (!typed.current) return
    const query = value.trim()
    const lower = query.toLowerCase()
    current.current = lower
    const area = near?.map(value => value.toFixed(2)).join(',') || ''
    for (const [key, controller] of flights.current) {
      const [asked, at] = key.split('|')
      if (at !== area || !lower.startsWith(asked)) { controller.abort(); flights.current.delete(key) }
    }
    if (query.length < 3) { setResults(query.length ? knownMatches(query, []) : []); setState('idle'); return }
    const key = `${lower}|${area}`
    const known = answers.get(key)
    if (known) { setResults(known); setState(known.length ? 'idle' : 'none'); return }
    setState('loading')
    // Meanwhile: what's already known that still fits (earlier answers in this tab).
    setResults(shown => knownMatches(query, shown))
    // The first search starts the moment there's enough to search; later keystrokes wait 250 ms for a pause.
    const first = flights.current.size === 0 && Date.now() - burst.current > 4000
    if (first) burst.current = Date.now()
    const timer = window.setTimeout(async () => {
      if (flights.current.has(key)) return
      const controller = new AbortController()
      flights.current.set(key, controller)
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}${near ? `&near=${near.join(',')}` : ''}`, { signal: controller.signal })
        const payload = response.ok ? await response.json() : null
        const places = Array.isArray(payload?.places) ? payload.places.slice(0, 6) as PlaceSuggestion[] : []
        if (response.ok) answers.set(key, places)
        if (controller.signal.aborted) return
        const now = current.current
        if (now === lower) {
          // Busy upstream: keep what's shown; the next keystroke asks again.
          if (response.status === 503) { setState('idle'); return }
          setResults(places); setActive(-1); setState(response.ok ? places.length ? 'idle' : 'none' : 'error')
        } else if (response.ok && now.startsWith(lower) && !answers.has(`${now}|${area}`)) {
          // An earlier, shorter search answered first: show what of it still fits; the exact search keeps loading.
          setResults(shown => knownMatches(now, shown))
        }
      } catch { if (!controller.signal.aborted && current.current === lower) setState('error') }
      finally { if (flights.current.get(key) === controller) flights.current.delete(key) }
    }, first ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [value, near])

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (place: PlaceSuggestion) => { rememberPlace(place); typed.current = false; setOpen(false); setResults([]); setState('idle'); onPick(place) }
  const query = value.trim().toLowerCase()
  const searched = query.length >= 3 || (query.length > 0 && results.length > 0)
  const browsing = !query || !typing
  const quickRows = quick.filter(row => row.match ? (browsing ? row.match.toLowerCase() !== query : placeMatches(row.match, query) && row.match.toLowerCase() !== query) : browsing).slice(0, browsing ? 6 : 3)
  const shownResults = (searched && typing ? results : []).filter(place => !quickRows.some(row => row.match && row.match.toLowerCase() === place.label.toLowerCase()))
  const rows = [...quickRows.map(row => ({ quick: row })), ...shownResults.map(place => ({ place }))] as Array<{ quick: QuickRow; place?: undefined } | { place: PlaceSuggestion; quick?: undefined }>
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
        onFocus={() => {
          setOpen(true); setTyping(false); onFocus?.()
          warm(near)
        }}
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
