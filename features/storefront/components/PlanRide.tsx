'use client'

import { useEffect, useRef, useState } from 'react'
import type { LngLat, Place } from '../lib/api'
import { milesBetween, recentPlaces, searchPlaces } from '../lib/places'
import type { Field } from '../domain/riderFlow'
import { WhenButton } from './WhenPanel'
import { Icon, Spinner, cx } from './ui'

/**
 * Uber's "Plan your ride": full screen, pickup prefilled with the current location, the destination
 * focused, suggestions as you type, "Set location on map" always last.
 */
export function PlanRide({ field, pickup, pickupIsGps, dropoff, near, when, onWhen, onPick, onField, onSetOnMap, onBack, onUseLocation, locating }: {
  field: Field
  pickup: Place | null
  pickupIsGps: boolean
  dropoff: Place | null
  near: LngLat | null
  when: string | null
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

  const recents = recentPlaces().filter(place => place.label !== pickup?.label && place.label !== dropoff?.label)
  const typing = query.trim().length >= 2
  const rows = typing ? results : recents
  const pick = (place: Place) => { setText(current => ({ ...current, [field]: '' })); onPick(field, place) }
  const fieldValue = (which: Field) => {
    if (text[which]) return text[which]
    const place = which === 'pickup' ? pickup : dropoff
    if (!place) return ''
    return which === 'pickup' && pickupIsGps ? '' : place.name
  }

  return <div className="fixed inset-0 z-40 flex flex-col bg-white lg:inset-auto lg:left-6 lg:top-[84px] lg:max-h-[calc(100dvh-108px)] lg:w-[400px] lg:rounded-2xl lg:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] fade-in" role="dialog" aria-modal="true" aria-label="Plan your ride">
    <header className="grid grid-cols-[44px_1fr_44px] items-center px-2 pt-[max(env(safe-area-inset-top),10px)] lg:pt-3">
      <button type="button" onClick={onBack} aria-label="Back" className="press grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black"><Icon.back className="size-6" /></button>
      <h1 className="text-center text-[18px] font-bold">Plan your ride</h1>
    </header>
    <div className="px-4 pt-2"><WhenButton when={when} onClick={onWhen} className="shadow-none ring-1 ring-[#e2e2e2]" /></div>
    <div className="relative mt-3 px-4">
      <span aria-hidden="true" className="absolute bottom-[26px] left-[33px] top-[26px] w-px bg-black" />
      {(['pickup', 'dropoff'] as const).map(which => <label key={which} className={cx('relative mt-2 flex h-12 items-center gap-3 rounded-xl bg-[#f3f3f3] pl-4 pr-2 first:mt-0', field === which && 'ring-2 ring-black')}>
        <span aria-hidden="true" className={cx('relative z-10 size-2.5 shrink-0 bg-black', which === 'pickup' && 'rounded-full')} />
        <span className="sr-only">{which === 'pickup' ? 'Pickup' : 'Destination'}</span>
        <input ref={inputs[which]} value={fieldValue(which)} onFocus={() => onField(which)} onChange={event => setText(current => ({ ...current, [which]: event.target.value }))}
          placeholder={which === 'pickup' ? (pickupIsGps ? 'Current location' : pickup ? pickup.name : 'Pickup location') : 'Where to?'}
          className={cx('h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none', which === 'pickup' && pickupIsGps && !text.pickup ? 'placeholder:text-black' : 'placeholder:text-[#6b6b6b]')}
          autoComplete="off" enterKeyHint="search" inputMode="search" />
        {text[which] && <button type="button" aria-label="Clear" onClick={() => setText(current => ({ ...current, [which]: '' }))} className="press -mr-1 grid size-11 place-items-center rounded-full text-[#6b6b6b]"><Icon.close className="size-4" /></button>}
      </label>)}
    </div>

    <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-6" aria-live="polite" aria-busy={loading}>
      {field === 'pickup' && !typing && <Row icon={locating ? <Spinner className="size-4" /> : <Icon.locate className="size-[18px]" />} title="Use current location" onClick={onUseLocation} />}
      {!typing && rows.length > 0 && <li className="pt-3 pb-1 text-[13px] font-semibold text-[#6b6b6b]">Recent</li>}
      {rows.map(place => <Row key={place.label} icon={typing ? <Icon.pin className="size-[18px]" /> : <Icon.history className="size-[18px]" />} title={place.name}
        detail={[place.detail, near && typing ? `${milesBetween(near, place.point).toFixed(1)} mi` : null].filter(Boolean).join(' · ')} onClick={() => pick(place)} />)}
      {typing && !loading && !results.length && <li className="px-1 py-4 text-[15px] text-[#6b6b6b]">{failed ? 'Search is unavailable. Try again, or set the location on the map.' : 'No matching places nearby.'}</li>}
      {typing && loading && !results.length && <li className="flex items-center gap-3 px-1 py-4 text-[15px] text-[#6b6b6b]"><Spinner className="size-4" />Searching…</li>}
      <Row icon={<Icon.target className="size-[18px]" />} title="Set location on map" onClick={() => onSetOnMap(field)} />
    </ul>
  </div>
}

function Row({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail?: string; onClick: () => void }) {
  return <li className="border-b border-[#eeeeee] last:border-none">
    <button type="button" onClick={onClick} className="press flex min-h-[60px] w-full items-center gap-4 py-2 text-left outline-none focus-visible:bg-black/5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eeeeee]">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium">{title}</span>{detail && <span className="block truncate text-[14px] text-[#6b6b6b]">{detail}</span>}</span>
    </button>
  </li>
}
