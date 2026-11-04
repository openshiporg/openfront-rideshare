'use client'

import { useEffect, useMemo, useState } from 'react'
import { Accessibility, CalendarClock, ChevronDown, Minus, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { pickupDays, pickupSlots, toLocalInputValue } from '../domain/pickupSlots'

const dayLabel = (day: Date, today: Date) => {
  const diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return day.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
}
const timeLabel = (date: Date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** One row for "when, and for whom": reads "Now · 1 rider" (or the chosen time) and opens a
 * popover with day chips, 15-minute slots, passengers and wheelchair need. Book-ahead
 * services have no "Now"; their first slot already honours the lead time. */
export function PickupTimePicker({ value, onChange, advanceBookingMinutes, passengers, maxPassengers, onPassengers, wheelchair, onWheelchair, disabled, children, open: openProp, onOpenChange, needed }: {
  value: string
  onChange: (value: string) => void
  advanceBookingMinutes: number
  passengers: number
  maxPassengers: number
  onPassengers: (value: number) => void
  wheelchair: boolean
  onWheelchair: (value: boolean) => void
  disabled?: boolean
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The ride can't be requested until a time is chosen: the row asks for it. */
  needed?: boolean
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => { setOwnOpen(next); onOpenChange?.(next) }
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [open])
  const bookAhead = advanceBookingMinutes > 0
  const days = useMemo(() => now ? pickupDays(now, advanceBookingMinutes) : [], [now, advanceBookingMinutes])
  const selected = value ? new Date(value) : null
  const [dayIndex, setDayIndex] = useState(0)
  useEffect(() => {
    if (!selected || !days.length) return
    const index = days.findIndex(day => day.toDateString() === selected.toDateString())
    if (index >= 0) setDayIndex(index)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, days.length])
  const day = days[Math.min(dayIndex, Math.max(0, days.length - 1))]
  const slots = useMemo(() => day && now ? pickupSlots(day, now, advanceBookingMinutes) : [], [day, now, advanceBookingMinutes])

  const when = selected && now ? `${dayLabel(selected, now)}, ${timeLabel(selected)}` : bookAhead ? 'Choose time' : 'Now'
  const who = `${passengers} ${passengers === 1 ? 'rider' : 'riders'}${wheelchair ? ' · Wheelchair' : ''}`

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild disabled={disabled}>
      <button type="button" className={`mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-tide disabled:opacity-60 ${needed ? 'bg-foam ring-2 ring-tide' : 'bg-[#f2f5f5] hover:bg-foam'}`}>
        <CalendarClock className="size-4 shrink-0 text-tide" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="font-medium">{needed ? 'Pick a pickup time' : 'Pickup time'}</span> {!needed && <span className="text-ink">· {when}</span>}<span className="text-muted-foreground"> · {who}</span>{needed && <span className="block text-xs text-muted-foreground">Book {advanceBookingMinutes % 60 ? `${advanceBookingMinutes} min` : `${advanceBookingMinutes / 60} hr`} ahead for this ride</span>}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} className="rs max-h-[min(40rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border-0 bg-white p-0 text-ink shadow-[0_18px_50px_-18px_rgba(11,43,46,0.5)] ring-1 ring-ink/10">
      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Pickup time</p>
          {bookAhead && <p className="text-xs text-muted-foreground">Book {advanceBookingMinutes % 60 ? `${advanceBookingMinutes} min` : `${advanceBookingMinutes / 60} hr`} ahead</p>}
        </div>
        <div role="group" aria-label="Day" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {!bookAhead && <button type="button" aria-pressed={!selected} onClick={() => { onChange(''); setOpen(false) }} className={chip(!selected)}>Now</button>}
          {now && days.map((item, index) => <button type="button" key={item.toDateString()} aria-pressed={Boolean(selected) && index === dayIndex} onClick={() => setDayIndex(index)} className={chip(index === dayIndex && (Boolean(selected) || bookAhead || index !== 0))}>{dayLabel(item, now)}</button>)}
        </div>
        <div role="listbox" aria-label="Time" className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
          {slots.map(slot => {
            const active = selected?.getTime() === slot.getTime()
            return <button type="button" role="option" aria-selected={active} key={slot.getTime()} onClick={() => { onChange(toLocalInputValue(slot)); setOpen(false) }} className={`h-10 rounded-lg text-sm tabular-nums transition-colors ${active ? 'bg-signal font-semibold text-white' : 'bg-[#f2f5f5] hover:bg-foam'}`}>{timeLabel(slot)}</button>
          })}
          {now && !slots.length && <p className="col-span-3 py-3 text-center text-sm text-muted-foreground">No times left today</p>}
        </div>
      </div>
      <div className="space-y-2 border-t border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Passengers</span>
          <span className="inline-flex items-center gap-2">
            <button type="button" aria-label="Fewer passengers" disabled={passengers <= 1} onClick={() => onPassengers(Math.max(1, passengers - 1))} className="grid size-9 place-items-center rounded-full ring-1 ring-ink/15 disabled:opacity-40"><Minus className="size-4" aria-hidden="true" /></button>
            <span aria-live="polite" className="w-6 text-center font-semibold tabular-nums">{passengers}</span>
            <button type="button" aria-label="More passengers" disabled={passengers >= maxPassengers} onClick={() => onPassengers(Math.min(maxPassengers, passengers + 1))} className="grid size-9 place-items-center rounded-full ring-1 ring-ink/15 disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /></button>
          </span>
        </div>
        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          <span className="inline-flex items-center gap-2"><Accessibility className="size-4 text-muted-foreground" aria-hidden="true" />Wheelchair accessible</span>
          <input type="checkbox" role="switch" checked={wheelchair} onChange={event => onWheelchair(event.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-full bg-[#dfe6e6] transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-signal peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-tide" />
        </label>
        {children}
      </div>
    </PopoverContent>
  </Popover>
}

const chip = (active: boolean) => `h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors ${active ? 'bg-ink font-semibold text-white' : 'bg-[#f2f5f5] text-ink hover:bg-foam'}`
