'use client'

import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react'
import Link from 'next/link'

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

type Tone = 'primary' | 'secondary' | 'danger' | 'plain'
const tones: Record<Tone, string> = {
  primary: 'bg-tide text-white hover:bg-tide-deep disabled:bg-[#a9bcb8]',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-rule hover:bg-tide-soft disabled:text-ink-3',
  danger: 'bg-white text-alert ring-1 ring-inset ring-rule hover:bg-[#fbeceb]',
  plain: 'bg-transparent text-ink hover:bg-ink/5',
}
const sizes = { lg: 'h-14 px-6 text-[17px] rounded-[18px]', md: 'h-12 px-5 text-[16px] rounded-[16px]', sm: 'h-11 px-4 text-[15px] rounded-[14px]' }
const base = 'press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 disabled:cursor-not-allowed'

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: keyof typeof sizes }>(
  function Button({ tone = 'primary', size = 'md', className, type = 'button', ...props }, ref) {
    return <button ref={ref} type={type} className={cx(base, tones[tone], sizes[size], className)} {...props} />
  })

export function ButtonLink({ tone = 'primary', size = 'md', className, ...props }: React.ComponentProps<typeof Link> & { tone?: Tone; size?: keyof typeof sizes }) {
  return <Link className={cx(base, tones[tone], sizes[size], className)} {...props} />
}

/** Squircle map control (back, menu): 44pt, floating over the map. */
export const MapButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function MapButton({ className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cx('press grid size-11 place-items-center rounded-[14px] bg-white text-ink shadow-[0_1px_0_rgba(16,35,31,0.06),0_6px_16px_-6px_rgba(16,35,31,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-tide', className)} {...props} />
})

/**
 * The paper sheet over the map. Its height is its content (each state sets its own size), it rises in
 * with an ease-out, and it reports its covered height so the map frames the trip above it. On wide
 * screens it becomes a floating left-hand panel.
 */
export function Sheet({ children, onHeight, label, className }: { children: React.ReactNode; onHeight: (px: number) => void; label: string; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const report = useRef(onHeight)
  useLayoutEffect(() => { report.current = onHeight })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => report.current(window.matchMedia('(min-width: 1024px)').matches ? 0 : node.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])
  return <section ref={ref} aria-label={label} className={cx(
    'sheet-in absolute inset-x-0 bottom-0 z-20 flex max-h-[calc(100dvh-88px)] flex-col rounded-t-[28px] bg-paper pb-[max(env(safe-area-inset-bottom),12px)] shadow-[0_-10px_30px_-12px_rgba(16,35,31,0.35)]',
    'lg:bottom-auto lg:left-6 lg:right-auto lg:top-[84px] lg:max-h-[calc(100dvh-108px)] lg:w-[420px] lg:rounded-[28px] lg:pb-3 lg:shadow-[0_12px_40px_-12px_rgba(16,35,31,0.4)]',
    className)}>
    <span aria-hidden="true" className="mx-auto mt-2.5 mb-1.5 block h-1 w-10 shrink-0 rounded-full bg-[#cfcabd] lg:hidden" />
    {children}
  </section>
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none', className)} />
}

/** Closes on Escape and outside taps; focus moves inside on open. */
export function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current() }
    const down = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close.current() }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', down)
    ref.current?.querySelector<HTMLElement>('button, a, input, textarea')?.focus({ preventScroll: true })
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', down) }
  }, [open, ref])
}

/* Icons: one stroke family, drawn here so the rider UI has no decorative dependencies. */
type IconProps = { className?: string }
const svg = (path: React.ReactNode, { className = 'size-5' }: IconProps, fill = false) => <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
export const Icon = {
  back: (p: IconProps = {}) => svg(<path d="M19 12H5m6-7-7 7 7 7" />, p),
  close: (p: IconProps = {}) => svg(<path d="M18 6 6 18M6 6l12 12" />, p),
  menu: (p: IconProps = {}) => svg(<path d="M4 7h16M4 12h16M4 17h16" />, p),
  search: (p: IconProps = {}) => svg(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>, p),
  clock: (p: IconProps = {}) => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, p),
  chevronDown: (p: IconProps = {}) => svg(<path d="m6 9 6 6 6-6" />, p),
  chevronRight: (p: IconProps = {}) => svg(<path d="m9 6 6 6-6 6" />, p),
  history: (p: IconProps = {}) => svg(<><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4" /><path d="M12 8v4l2.5 1.5" /></>, p),
  pin: (p: IconProps = {}) => svg(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>, p),
  locate: (p: IconProps = {}) => svg(<path d="M20 4 4 11l7 2 2 7 7-16Z" />, p),
  target: (p: IconProps = {}) => svg(<><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>, p),
  person: (p: IconProps = {}) => svg(<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />, p, true),
  card: (p: IconProps = {}) => svg(<><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18" /></>, p),
  star: (p: IconProps = {}) => svg(<path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8L12 3Z" />, p, true),
  share: (p: IconProps = {}) => svg(<><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>, p),
  message: (p: IconProps = {}) => svg(<path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9.5Z" />, p),
  check: (p: IconProps = {}) => svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, p),
  wheelchair: (p: IconProps = {}) => svg(<><circle cx="11" cy="4.5" r="1.6" /><path d="M11 7.5v6h5.5l2.5 5" /><path d="M8 10.5a5.5 5.5 0 1 0 6.6 7" /></>, p),
}

/** Pickup is a teal ring, drop-off an amber dot: the two marks used on the map and in every list. */
export function PickupMark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('grid size-3 shrink-0 place-items-center rounded-full bg-white ring-[2.5px] ring-tide', className)} />
}
export function DropoffMark({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('block size-3 shrink-0 rounded-full bg-signal', className)} />
}
export function RouteMarks({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('flex w-3 shrink-0 flex-col items-center', className)}>
    <PickupMark />
    <span className="my-1 w-0 flex-1 border-l-2 border-dotted border-[#c9c4b6]" />
    <DropoffMark />
  </span>
}

/** The ride's vehicle drawing (one free line set, public/vehicles), in the surrounding text colour. */
export function VehicleArt({ src, className }: { src: string; className?: string }) {
  return <span aria-hidden="true" className={cx('vehicle block shrink-0', className)} style={{ ['--art' as string]: `url("${src}")` }} />
}

export { cx }
