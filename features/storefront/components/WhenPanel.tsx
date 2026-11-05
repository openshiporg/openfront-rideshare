'use client'

import { useMemo, useState } from 'react'
import { earliestScheduled } from '../domain/riderFlow'
import { dayAndTime } from '../lib/format'
import { Button, Icon, cx } from './ui'

/**
 * Uber's "When do you want to be picked up?": Now is selected unless the rider schedules.
 * Reached only from the "Now ▾" control; never a step in the booking path.
 */
export function WhenPanel({ when, leadMinutes, onDone, onCancel }: { when: string | null; leadMinutes: number; onDone: (when: string | null) => void; onCancel: () => void }) {
  const now = useMemo(() => new Date(), [])
  const earliest = useMemo(() => earliestScheduled(now, leadMinutes), [now, leadMinutes])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(earliest); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index); return day }), [earliest])
  const [mode, setMode] = useState<'now' | 'later'>(when ? 'later' : 'now')
  const initial = when ? new Date(when) : earliest
  const [day, setDay] = useState(() => days.findIndex(d => d.toDateString() === initial.toDateString()) >= 0 ? days.findIndex(d => d.toDateString() === initial.toDateString()) : 0)
  const [slot, setSlot] = useState(() => when ? new Date(when).getTime() : earliest.getTime())
  const slots = useMemo(() => {
    const start = new Date(days[day]); const end = new Date(start); end.setDate(end.getDate() + 1)
    const out: Date[] = []
    for (let at = new Date(Math.max(start.getTime(), earliest.getTime())); at < end; at = new Date(at.getTime() + 15 * 60_000)) {
      const rounded = new Date(at); rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15, 0, 0)
      if (!out.length || rounded.getTime() !== out.at(-1)!.getTime()) out.push(rounded)
    }
    return out
  }, [days, day, earliest])
  const chosen = slots.find(s => s.getTime() === slot) || slots[0]
  return <div className="flex min-h-0 flex-col px-4 pt-2">
    <h2 className="text-center text-[20px] font-bold leading-7">When do you want to be picked up?</h2>
    <div role="radiogroup" aria-label="Pickup time" className="mt-4 grid grid-cols-2 gap-2">
      {(['now', 'later'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
        className={cx('press h-12 rounded-xl text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-black', mode === value ? 'bg-black text-white' : 'bg-[#eeeeee] text-black')}>
        {value === 'now' ? 'Now' : 'Schedule'}
      </button>)}
    </div>
    {mode === 'later' && <div className="mt-4 flex min-h-0 flex-col">
      <div role="radiogroup" aria-label="Day" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {days.map((d, index) => <button key={d.toISOString()} type="button" role="radio" aria-checked={day === index} onClick={() => { setDay(index); setSlot(0) }}
          className={cx('press min-h-11 shrink-0 border-b-2 px-3 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-black', day === index ? 'border-black text-black' : 'border-transparent text-[#6b6b6b]')}>
          {index === 0 && d.toDateString() === now.toDateString() ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}
        </button>)}
      </div>
      <ul role="radiogroup" aria-label="Time" className="max-h-[38dvh] overflow-y-auto border-t border-[#eeeeee] [scrollbar-width:thin]">
        {slots.map(s => <li key={s.getTime()}><button type="button" role="radio" aria-checked={chosen?.getTime() === s.getTime()} onClick={() => setSlot(s.getTime())}
          className="press flex min-h-12 w-full items-center justify-between px-1 text-left text-[16px] outline-none focus-visible:bg-black/5">
          <span className={chosen?.getTime() === s.getTime() ? 'font-semibold' : ''}>{s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          {chosen?.getTime() === s.getTime() && <Icon.check className="size-5" />}
        </button></li>)}
      </ul>
      {leadMinutes > 15 && <p className="mt-2 text-[13px] text-[#6b6b6b]">This ride can be scheduled from {dayAndTime(earliest)}.</p>}
    </div>}
    <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
      <Button tone="secondary" size="lg" onClick={onCancel}>Cancel</Button>
      <Button size="lg" onClick={() => onDone(mode === 'now' || !chosen ? null : chosen.toISOString())}>{mode === 'now' || !chosen ? 'Pick up now' : `Schedule ${dayAndTime(chosen)}`}</Button>
    </div>
  </div>
}

/** The "Now ▾" control itself: shows the chosen time once scheduled. */
export function WhenButton({ when, onClick, className }: { when: string | null; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} aria-label={when ? `Pickup ${dayAndTime(when)}. Change pickup time` : 'Pickup now. Change pickup time'}
    className={cx('press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-[15px] font-semibold text-black shadow-[0_1px_4px_rgba(0,0,0,0.12)] outline-none focus-visible:ring-2 focus-visible:ring-black', className)}>
    <Icon.clock className="size-[18px]" />{when ? dayAndTime(when) : 'Now'}<Icon.chevronDown className="size-4" />
  </button>
}
