'use client'

import { useEffect, useRef, useState } from 'react'
import type { LngLat, Place } from '../lib/api'
import { milesBetween, useRecentPlaces, searchPlaces } from '../lib/places'
import type { Field } from '../domain/riderFlow'
import { WhenSwitch } from './WhenPanel'
import { DropoffMark, Icon, PickupMark, Spinner, cx } from './ui'

/**
 * Uber's "Plan your ride": full screen, pickup prefilled with the current location, the destination
 * focused, suggestions as you type, "Set location on map" always last.
 */
export function PlanRide({ field, pickup, pickupIsGps, dropoff, near, when, onNow, onWhen, onPick, onField, onSetOnMap, onBack, onUseLocation, locating }: {
  field: Field
  pickup: Place | null
  pickupIsGps: boolean
  dropoff: Place | null
  near: LngLat | null
  when: string | null
  onNow: () => void
  onWhen: () => void
  onPick: (field: Field, place: Place) => void
  onField: (field: Field) => void
  onSetOnMap: (field: Field) => void
  onBack: () => void
  onUseLocation: () => void
  locating: boolean
}) {
  const [text, setText] = useState<Record<Field, string>>({ pickup: '', dropoff: '' })
  const [results, setResults] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const pickupInput = useRef<HTMLInputElement>(null)
  const dropoffInput = useRef<HTMLInputElement>(null)
  const inputs = { pickup: pickupInput, dropoff: dropoffInput }
  const query = text[field]

  useEffect(() => { inputs[field].current?.focus({ preventScroll: true }) }, [field]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFailed(false)
    if (query.trim().length < 2) { setResults([]); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchPlaces(query, near, controller.signal)
        .then(found => { if (!controller.signal.aborted) setResults(found) })
        .catch(() => { if (!controller.signal.aborted) { setResults([]); setFailed(true) } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, near?.[0], near?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  const recents = useRecentPlaces().filter(place => place.label !== pickup?.label && place.label !== dropoff?.label)
  const typing = query.trim().length >= 2
  const rows = typing ? results : recents
  const pick = (place: Place) => { setText(current => ({ ...current, [field]: '' })); onPick(field, place) }
  const fieldValue = (which: Field) => {
    if (text[which]) return text[which]
    const place = which === 'pickup' ? pickup : dropoff
    if (!place) return ''
    return which === 'pickup' && pickupIsGps ? '' : place.label
  }

  return <div className="fixed inset-0 z-40 flex flex-col bg-paper lg:inset-auto lg:left-6 lg:top-[84px] lg:max-h-[calc(100dvh-108px)] lg:w-[420px] lg:rounded-[28px] lg:shadow-[0_12px_40px_-12px_rgba(16,35,31,0.4)] fade-in" role="dialog" aria-modal="true" aria-label="Plan your ride">
    <header className="grid grid-cols-[44px_1fr_44px] items-center px-2 pt-[max(env(safe-area-inset-top),10px)] lg:pt-3">
      <button type="button" onClick={onBack} aria-label="Back" className="press grid size-11 place-items-center rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-tide"><Icon.back className="size-6" /></button>
      <h1 className="display text-center text-[19px] font-bold">Plan your ride</h1>
    </header>
    <div className="px-4 pt-2"><WhenSwitch when={when} onNow={onNow} onSchedule={onWhen} /></div>
    <div className="relative mt-3 px-4">
      <span aria-hidden="true" className="absolute bottom-[30px] left-[37px] top-[30px] w-0 border-l-2 border-dotted border-[#c9c4b6]" />
      {(['pickup', 'dropoff'] as const).map(which => <label key={which} className={cx('relative mt-2 flex h-14 items-center gap-3 rounded-[16px] bg-white pl-4 pr-2 ring-1 ring-rule first:mt-0', field === which && 'ring-2 ring-tide')}>
        {which === 'pickup' ? <PickupMark className="relative z-10" /> : <DropoffMark className="relative z-10" />}
        <span className="sr-only">{which === 'pickup' ? 'Pickup' : 'Destination'}</span>
        <input ref={inputs[which]} value={fieldValue(which)} onFocus={() => onField(which)} onChange={event => setText(current => ({ ...current, [which]: event.target.value }))}
          placeholder={which === 'pickup' ? (pickupIsGps ? 'Current location' : pickup ? pickup.name : 'Pickup location') : 'Where to?'}
          className={cx('h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none', which === 'pickup' && pickupIsGps && !text.pickup ? 'placeholder:text-ink' : 'placeholder:text-ink-3')}
          autoComplete="off" enterKeyHint="search" inputMode="search" />
        {text[which] && <button type="button" aria-label="Clear" onClick={() => setText(current => ({ ...current, [which]: '' }))} className="press -mr-1 grid size-11 place-items-center rounded-[12px] text-ink-3"><Icon.close className="size-4" /></button>}
      </label>)}
    </div>

    <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-6" aria-live="polite" aria-busy={loading}>
      {field === 'pickup' && !typing && <Row icon={locating ? <Spinner className="size-4" /> : <Icon.locate className="size-[18px]" />} title="Use current location" onClick={onUseLocation} />}
      {!typing && rows.length > 0 && <li className="pt-3 pb-1 text-[13px] font-semibold text-ink-3">Recent</li>}
      {rows.map(place => <Row key={place.label} icon={typing ? <Icon.pin className="size-[18px]" /> : <Icon.history className="size-[18px]" />} title={place.name}
        detail={[place.detail, near && typing ? `${milesBetween(near, place.point).toFixed(1)} mi` : null].filter(Boolean).join(' · ')} onClick={() => pick(place)} />)}
      {typing && !loading && !results.length && <li className="px-1 py-4 text-[15px] text-ink-2">{failed ? 'Search is unavailable. Try again, or set the location on the map.' : 'No matching places nearby.'}</li>}
      {typing && loading && !results.length && <li className="flex items-center gap-3 px-1 py-4 text-[15px] text-ink-2"><Spinner className="size-4 text-tide" />Searching…</li>}
      <Row icon={<Icon.target className="size-[18px]" />} title="Set location on map" onClick={() => onSetOnMap(field)} />
    </ul>
  </div>
}

function Row({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail?: string; onClick: () => void }) {
  return <li className="border-b border-rule last:border-none">
    <button type="button" onClick={onClick} className="press flex min-h-[60px] w-full items-center gap-4 py-2 text-left outline-none focus-visible:bg-tide-soft">
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-tide-soft text-tide">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium">{title}</span>{detail && <span className="block truncate text-[14px] text-ink-3">{detail}</span>}</span>
    </button>
  </li>
}
