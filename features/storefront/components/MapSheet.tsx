'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Drawer } from 'vaul'

export type SheetSnap = 'peek' | 'half' | 'full'
const ORDER: SheetSnap[] = ['peek', 'half', 'full']

/** Detent heights for this viewport (px). Peek shows the trip's two fields; full leaves the map chrome
 * (brand chip, menu, attribution) clear above the sheet. */
export function sheetHeights(viewport: number, halfRatio = 0.56) {
  const full = Math.max(viewport - 92, 320)
  const peek = Math.min(Math.max(176, Math.round(viewport * 0.2)), full - 2)
  const half = Math.min(Math.max(Math.round(viewport * halfRatio), peek + 120), full - 1)
  return { peek, half, full }
}

const HANDLE = 24

/**
 * The phone's rider sheet over the live map, built on Vaul (emilkowalski/vaul): non-modal so the map
 * stays pannable and zoomable at every detent, three snap points (peek / half / full), never dismissed.
 * Vaul owns the drag physics: velocity flicks, rubber band, drag-down from a list at its top. The sheet
 * is the page's only scroll container, and it scrolls only at full.
 * At 1024px and up (and on a phone on its side) the same content is a fixed panel beside the map.
 */
export function MapSheet({ snap, onSnap, onHeight, label, side = 0, panel = false, halfRatio, children }: {
  snap: SheetSnap
  onSnap: (snap: SheetSnap) => void
  /** The covered height once a snap settles (for framing the map). */
  onHeight?: (px: number) => void
  label: string
  /** A phone on its side: a fixed panel this wide down the left of the map instead of a sheet. */
  side?: number
  /** Desktop: the floating booking panel. */
  panel?: boolean
  /** Share of the screen at half height (taller while choosing a ride, so the options fit). */
  halfRatio?: number
  children: React.ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)
  const heights = sheetHeights(viewport, halfRatio)
  const fixedPanel = panel || side > 0
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const measure = () => setViewport(Math.max(window.innerHeight, 400))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => { onHeight?.(fixedPanel ? 0 : heights[snap]) }, [snap, fixedPanel, heights.peek, heights.half, heights.full]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving full height puts the list back at its top, so the next drag moves the sheet.
  useEffect(() => { if (snap !== 'full' && scroller.current) scroller.current.scrollTop = 0 }, [snap])

  // A drag that ends over a button must not also press it.
  const press = useRef<{ y: number } | null>(null)
  const justDragged = useRef(0)
  const guard = {
    onPointerDownCapture: (event: React.PointerEvent) => { press.current = { y: event.clientY } },
    onPointerUpCapture: (event: React.PointerEvent) => { if (press.current && Math.abs(event.clientY - press.current.y) > 8) justDragged.current = Date.now(); press.current = null },
    onClickCapture: (event: React.MouseEvent) => { if (Date.now() - justDragged.current < 250) { event.preventDefault(); event.stopPropagation() } },
  }

  if (fixedPanel) {
    return <section aria-label={label} data-snap="full" data-side={side ? '' : undefined}
      style={side ? { top: '4rem', bottom: '0.75rem', left: '0.75rem', width: side } : undefined}
      className={`map-sheet group/sheet pointer-events-auto absolute z-30 flex flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_18px_50px_-22px_rgba(11,43,46,0.45)] ring-1 ring-ink/5 ${side ? '' : 'bottom-auto left-10 top-[calc(4.4rem+1.5rem)] max-h-[calc(100%-4.4rem-3rem)] w-[28.75rem]'}`}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
    </section>
  }

  // Full is the whole of this frame (Vaul lets the list scroll only when the sheet is fully up), and the
  // frame stops below the map chrome, so the brand, menu and attribution stay visible at every detent.
  const points: (string | number)[] = [`${heights.peek}px`, `${heights.half}px`, 1]
  const step = (direction: 1 | -1) => onSnap(ORDER[Math.min(Math.max(ORDER.indexOf(snap) + direction, 0), ORDER.length - 1)])
  return <div ref={setFrame} aria-hidden={false} style={{ top: viewport - heights.full }} className="pointer-events-none absolute inset-x-0 bottom-0 z-30 overflow-hidden">
  {frame && <Drawer.Root open modal={false} dismissible={false} snapPoints={points} fadeFromIndex={2} repositionInputs={false} noBodyStyles container={frame}
    activeSnapPoint={points[ORDER.indexOf(snap)]}
    setActiveSnapPoint={point => { const index = points.indexOf(point as string | number); if (index >= 0 && ORDER[index] !== snap) onSnap(ORDER[index]) }}>
    <Drawer.Content aria-label={label} aria-describedby={undefined} data-snap={snap} {...guard}
      className="map-sheet group/sheet pointer-events-auto absolute inset-x-0 bottom-0 flex h-full flex-col rounded-t-[24px] bg-white shadow-[0_-12px_40px_-20px_rgba(11,43,46,0.5)] outline-none">
      <Drawer.Title className="sr-only">{label}</Drawer.Title>
      <button type="button"
        onClick={() => onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half')}
        onKeyDown={event => { if (event.key === 'ArrowUp') { event.preventDefault(); step(1) } else if (event.key === 'ArrowDown') { event.preventDefault(); step(-1) } }}
        aria-label={snap === 'full' ? 'Show more map' : 'Show more'}
        aria-expanded={snap !== 'peek'}
        style={{ height: HANDLE }}
        className="flex w-full shrink-0 cursor-grab items-center justify-center rounded-t-[24px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing">
        <Drawer.Handle preventCycle className="!h-[5px] !w-10 !bg-[#c9d3d4] !opacity-100" />
      </button>
      {/* The visible part of the sheet: its own height at each detent, so the sticky actions sit on screen. */}
      <div ref={scroller} style={{ maxHeight: heights[snap] - HANDLE }}
        className={`sheet-body min-h-0 flex-1 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] ${snap === 'full' ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}`}>
        {children}
      </div>
    </Drawer.Content>
  </Drawer.Root>}
  </div>
}
