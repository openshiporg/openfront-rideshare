/** Pickup-time slots for the rider picker. Pure so the lead-time rule can be tested. */

export const SLOT_MINUTES = 15
export const BOOKING_HORIZON_DAYS = 7

/** First bookable instant: now plus the service's book-ahead lead (plus a short buffer for
 * the quote round trip), rounded up to the next slot boundary. */
export function earliestPickup(now: Date, advanceBookingMinutes: number, bufferMinutes = 5) {
  const ms = now.getTime() + (Math.max(0, advanceBookingMinutes) + bufferMinutes) * 60_000
  const step = SLOT_MINUTES * 60_000
  return new Date(Math.ceil(ms / step) * step)
}

function startOfDay(date: Date) {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day
}

/** Bookable days from the earliest pickup's day through the horizon. */
export function pickupDays(now: Date, advanceBookingMinutes: number, horizonDays = BOOKING_HORIZON_DAYS) {
  const first = startOfDay(earliestPickup(now, advanceBookingMinutes))
  const last = startOfDay(new Date(now.getTime() + horizonDays * 86_400_000))
  const days: Date[] = []
  for (const day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) days.push(new Date(day))
  return days
}

/** Slots on one local day, never earlier than the earliest bookable pickup. */
export function pickupSlots(day: Date, now: Date, advanceBookingMinutes: number) {
  const earliest = earliestPickup(now, advanceBookingMinutes).getTime()
  const start = startOfDay(day)
  const slots: Date[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    const slot = new Date(start)
    slot.setMinutes(minutes)
    if (slot.getDate() !== start.getDate()) break
    if (slot.getTime() >= earliest) slots.push(slot)
  }
  return slots
}

/** `datetime-local` value (local wall time), which the quote flow already parses. */
export function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
