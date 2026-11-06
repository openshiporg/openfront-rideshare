'use client'

import { useMemo, useState } from 'react'
import { earliestScheduled } from '../domain/riderFlow'
import { clock, dayAndTime } from '../lib/format'
import { Button, Icon, cx } from './ui'

/**
 * Choosing a later pickup: a day strip and a column of times. Only reached from the Schedule half of
 * the switch; never a step in the booking path, and "Leave now" is always one tap away.
 */
export function WhenPanel({ when, leadMinutes, onDone, onCancel }: { when: string | null; leadMinutes: number; onDone: (when: string | null) => void; onCancel: () => void }) {
  const now = useMemo(() => new Date(), [])
  const earliest = useMemo(() => earliestScheduled(now, leadMinutes), [now, leadMinutes])
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const day = new Date(earliest); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + index); return day }), [earliest])
  const initial = when ? new Date(when) : earliest
  const [day, setDay] = useState(() => Math.max(0, days.findIndex(d => d.toDateString() === initial.toDateString())))
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
    <h2 className="display text-[22px] font-bold leading-7">Schedule a pickup</h2>
    <p className="mt-1 text-[14px] text-ink-2">Your driver is booked for this time. You can still leave now instead.</p>
    <div role="radiogroup" aria-label="Day" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {days.map((d, index) => {
        const on = day === index
        return <button key={d.toISOString()} type="button" role="radio" aria-checked={on} onClick={() => { setDay(index); setSlot(0) }}
          className={cx('press flex min-h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-tide', on ? 'bg-tide text-white' : 'bg-white text-ink ring-1 ring-inset ring-rule')}>
          <span className={cx('text-[12px] font-semibold', on ? 'text-white/80' : 'text-ink-3')}>{index === 0 && d.toDateString() === now.toDateString() ? 'Today' : d.toLocaleDateString([], { weekday: 'short' })}</span>
          <span className="display text-[18px] font-bold leading-6">{d.getDate()}</span>
        </button>
      })}
    </div>
    <ul role="radiogroup" aria-label="Time" className="mt-3 grid max-h-[34dvh] grid-cols-3 gap-2 overflow-y-auto pb-1 [scrollbar-width:thin] min-[360px]:grid-cols-4">
      {slots.map(s => {
        const on = chosen?.getTime() === s.getTime()
        return <li key={s.getTime()}><button type="button" role="radio" aria-checked={on} onClick={() => setSlot(s.getTime())}
          className={cx('press flex h-11 w-full items-center justify-center rounded-[12px] text-[15px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-tide', on ? 'bg-ink font-semibold text-white' : 'bg-white text-ink ring-1 ring-inset ring-rule')}>
          {clock(s)}
        </button></li>
      })}
    </ul>
    {leadMinutes > 15 && <p className="mt-2 text-[13px] text-ink-3">This ride can be scheduled from {dayAndTime(earliest)}.</p>}
    <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
      <Button tone="secondary" size="lg" onClick={() => onDone(null)}>Leave now</Button>
      <Button size="lg" disabled={!chosen} onClick={() => chosen && onDone(chosen.toISOString())}>{chosen ? `Schedule ${dayAndTime(chosen)}` : 'Schedule'}</Button>
    </div>
    <button type="button" onClick={onCancel} className="press mx-auto mt-1 min-h-11 px-4 text-[14px] font-semibold text-ink-2 outline-none focus-visible:underline">Close</button>
  </div>
}

/**
 * The time switch, inside the sheet: "Leave now" and "Schedule" as two halves of one track, with a
 * white thumb that slides to the chosen half. Once a time is set, the Schedule half shows it.
 */
export function WhenSwitch({ when, onNow, onSchedule, className }: { when: string | null; onNow: () => void; onSchedule: () => void; className?: string }) {
  const later = Boolean(when)
  return <div role="radiogroup" aria-label="Pickup time" className={cx('relative grid h-11 grid-cols-2 rounded-[14px] bg-[#e9e5da] p-1', className)}>
    <span aria-hidden="true" className={cx('when-thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[11px] bg-white shadow-[0_1px_2px_rgba(16,35,31,0.12),0_2px_8px_-2px_rgba(16,35,31,0.18)]', later && 'translate-x-full')} />
    <button type="button" role="radio" aria-checked={!later} onClick={onNow}
      className={cx('press relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tide', later ? 'text-ink-2' : 'text-ink')}>
      <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', later ? 'bg-ink-3/50' : 'bg-tide')} /><span className="truncate">Leave now</span>
    </button>
    <button type="button" role="radio" aria-checked={later} onClick={onSchedule} aria-label={later ? `Scheduled ${dayAndTime(when!)}. Change time` : 'Schedule for later'}
      className={cx('press relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tide', later ? 'text-ink' : 'text-ink-2')}>
      <Icon.clock className="size-4 shrink-0" /><span className="truncate">{later ? dayAndTime(when!) : 'Schedule'}</span>
    </button>
  </div>
}
