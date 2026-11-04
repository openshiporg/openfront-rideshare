'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type SheetSnap = 'peek' | 'half' | 'full'
const ORDER: SheetSnap[] = ['peek', 'half', 'full']

/** Detent heights for this viewport (px). Peek leaves the search field; full leaves a strip of map. */
export function sheetHeights(viewport: number, halfRatio = 0.56) {
  const full = Math.max(viewport - 72, 320)
  const peek = Math.min(Math.max(150, Math.round(viewport * 0.19)), full - 1)
  const half = Math.min(Math.max(Math.round(viewport * halfRatio), peek + 120), full)
  return { peek, half, full }
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The phone's bottom sheet over the live map (Apple Maps / Uber model): three detents, peek / half /
 * full. Drag the handle or the sheet itself between them; the content scrolls only at full, and a
 * downward drag with the content at its top pulls the sheet down again (vaul's shouldDrag rules).
 * Everything outside the sheet is the map, which stays pannable and zoomable at every detent.
 * At 1024px and up the same element is the floating booking panel (no drag).
 */
export function MapSheet({ snap, onSnap, onHeight, label, side = 0, halfRatio, children }: {
  snap: SheetSnap
  onSnap: (snap: SheetSnap) => void
  /** The covered height once a drag or snap settles (for framing the map). */
  onHeight?: (px: number) => void
  label: string
  /** A phone on its side: a fixed panel this wide down the left of the map instead of a sheet. */
  side?: number
  /** Share of the screen at half height (taller while choosing a ride, so the options fit). */
  halfRatio?: number
  children: React.ReactNode
}) {
  const sheet = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const heights = sheetHeights(viewport, halfRatio)
  const height = dragHeight ?? heights[snap]
  const drag = useRef<null | { startY: number; startX: number; startHeight: number; decided: boolean; dragging: boolean; samples: Array<{ y: number; t: number }>; fromScroller: boolean }>(null)
  const justDragged = useRef(0)
  const snapRef = useRef(snap)
  const heightsRef = useRef(heights)
  const sideRef = useRef(side)
  useLayoutEffect(() => { snapRef.current = snap; heightsRef.current = heights; sideRef.current = side })

  useLayoutEffect(() => {
    const measure = () => setViewport(Math.max(window.innerHeight, 400))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => { if (dragHeight === null) onHeight?.(side ? 0 : heights[snap]) }, [snap, side, heights.peek, heights.half, heights.full, dragHeight]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving full height puts the list back at its top, so the next drag moves the sheet.
  useEffect(() => { if (snap !== 'full' && scroller.current) scroller.current.scrollTop = 0 }, [snap])

  const settle = useCallback((finalHeight: number, velocity: number) => {
    const h = heightsRef.current
    const points = ORDER.map(name => ({ name, value: h[name] }))
    let target: SheetSnap
    if (Math.abs(velocity) > 0.45) {
      // A flick moves one detent in its direction from where the finger let go.
      const up = velocity < 0
      const candidates = points.filter(point => up ? point.value > finalHeight + 4 : point.value < finalHeight - 4)
      target = (up ? candidates[0] : candidates.at(-1))?.name ?? (up ? 'full' : 'peek')
    } else {
      target = points.reduce((best, point) => Math.abs(point.value - finalHeight) < Math.abs(best.value - finalHeight) ? point : best).name
    }
    setDragHeight(null)
    onSnap(target)
  }, [onSnap])

  // Touch drags (non-passive so a sheet drag never also scrolls the page or the list).
  useEffect(() => {
    const element = sheet.current
    if (!element) return
    const desktop = () => window.innerWidth >= 1024 || sideRef.current > 0
    const start = (event: TouchEvent) => {
      if (desktop() || event.touches.length !== 1) { drag.current = null; return }
      const target = event.target as HTMLElement
      if (target.closest('[data-sheet-no-drag]')) { drag.current = null; return }
      const touch = event.touches[0]
      drag.current = { startY: touch.clientY, startX: touch.clientX, startHeight: element.getBoundingClientRect().height, decided: false, dragging: false, samples: [{ y: touch.clientY, t: event.timeStamp }], fromScroller: Boolean(scroller.current?.contains(target)) }
    }
    const move = (event: TouchEvent) => {
      const state = drag.current
      if (!state) return
      const touch = event.touches[0]
      const dy = touch.clientY - state.startY
      const dx = touch.clientX - state.startX
      if (!state.decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) { if (snapRef.current !== 'full' && event.cancelable) event.preventDefault(); return }
        state.decided = true
        const list = scroller.current
        // Sideways: a horizontal scroller inside the sheet keeps the gesture.
        if (Math.abs(dx) > Math.abs(dy)) state.dragging = false
        else if (snapRef.current !== 'full' || !state.fromScroller) state.dragging = true
        // At full, the list scrolls; only a downward pull with the list at its top moves the sheet.
        else state.dragging = dy > 0 && (list?.scrollTop ?? 0) <= 0
        if (state.dragging && document.activeElement instanceof HTMLElement && state.fromScroller && dy > 0) document.activeElement.blur()
      }
      if (!state.dragging) return
      if (event.cancelable) event.preventDefault()
      const h = heightsRef.current
      const raw = state.startHeight - dy
      // Rubber band past the ends.
      const next = raw > h.full ? h.full + (raw - h.full) * 0.2 : raw < h.peek ? h.peek - (h.peek - raw) * 0.35 : raw
      setDragHeight(Math.round(next))
      state.samples.push({ y: touch.clientY, t: event.timeStamp })
      if (state.samples.length > 6) state.samples.shift()
    }
    const end = () => {
      const state = drag.current
      drag.current = null
      if (!state?.dragging) return
      justDragged.current = Date.now()
      const first = state.samples[0]; const last = state.samples.at(-1)!
      const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      settle(element.getBoundingClientRect().height, velocity)
    }
    element.addEventListener('touchstart', start, { passive: true })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', end)
    element.addEventListener('touchcancel', end)
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', end)
      element.removeEventListener('touchcancel', end)
    }
  }, [settle])

  // Mouse drags on the handle (desktop browsers at phone widths).
  const onHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' || window.innerWidth >= 1024 || side) return
    const startY = event.clientY
    const startHeight = sheet.current?.getBoundingClientRect().height || heights[snap]
    const samples = [{ y: startY, t: event.timeStamp }]
    let moved = false
    const move = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dy) < 4) return
      moved = true
      const h = heightsRef.current
      setDragHeight(Math.round(Math.min(Math.max(startHeight - dy, h.peek - 30), h.full + 20)))
      samples.push({ y: moveEvent.clientY, t: moveEvent.timeStamp }); if (samples.length > 6) samples.shift()
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      if (!moved) return
      justDragged.current = Date.now()
      const first = samples[0]; const last = samples.at(-1)!
      settle(sheet.current?.getBoundingClientRect().height || startHeight, last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const step = (direction: 1 | -1) => onSnap(ORDER[Math.min(Math.max(ORDER.indexOf(snap) + direction, 0), ORDER.length - 1)])
  const animate = dragHeight === null && !reducedMotion()

  return <section
    ref={sheet}
    aria-label={label}
    data-snap={side ? "full" : snap}
    data-side={side ? '' : undefined}
    style={(side ? { '--sheet-h': 'auto', top: '4rem', bottom: '0.75rem', left: '0.75rem', width: side, borderRadius: '1.25rem' } : { '--sheet-h': `${height}px` }) as unknown as React.CSSProperties}
    onClickCapture={event => { if (Date.now() - justDragged.current < 250) { event.preventDefault(); event.stopPropagation() } }}
    className={`map-sheet group/sheet pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-[0_-12px_40px_-20px_rgba(11,43,46,0.5)] max-lg:h-[var(--sheet-h)] max-lg:overscroll-none ${snap === 'full' || side ? '' : 'max-lg:touch-none'} ${animate && !side ? 'max-lg:transition-[height] max-lg:duration-[380ms] max-lg:ease-[cubic-bezier(0.32,0.72,0,1)]' : ''} lg:bottom-auto lg:left-10 lg:right-auto lg:top-[calc(4.4rem+1.5rem)] lg:max-h-[calc(100%-4.4rem-3rem)] lg:w-[28.75rem] lg:rounded-2xl lg:shadow-[0_18px_50px_-22px_rgba(11,43,46,0.45)] lg:ring-1 lg:ring-ink/5`}
  >
    <button
      type="button"
      onPointerDown={onHandlePointerDown}
      onClick={() => onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek')}
      onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); step(1) } else if (event.key === 'ArrowDown') { event.preventDefault(); step(-1) } }}
      aria-label={snap === 'full' ? 'Show map' : 'Show more'}
      aria-expanded={snap !== 'peek'}
      className={`flex h-6 w-full shrink-0 cursor-grab touch-none items-center justify-center pt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing lg:hidden ${side ? 'hidden' : ''}`}
    ><span aria-hidden="true" className="block h-1.5 w-12 rounded-full bg-[#c9d3d4]" /></button>
    <div ref={scroller} className={`min-h-0 flex-1 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-6 lg:overflow-y-auto lg:overscroll-contain lg:p-4 ${snap === 'full' || side ? 'max-lg:overflow-y-auto max-lg:overscroll-contain' : 'max-lg:overflow-hidden'} ${side ? 'pt-3' : ''}`}>
      {children}
    </div>
  </section>
}
