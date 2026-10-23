import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Storefront segmented controls and command groups: raised pills in a recessed kerb track.
export function RiderTrack({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={cn('inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-asphalt p-1 ring-1 ring-inset ring-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>{children}</div>
}

const pill = (active: boolean) => cn(
  'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm transition-[color,background-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  active ? 'bg-lane font-semibold text-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_1px_2px_rgba(0,0,0,0.5)] ring-1 ring-white/10' : 'text-muted-foreground hover:text-foreground',
)

export function RiderPill({ active, className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { active: boolean }) {
  return <button type="button" aria-pressed={active} className={cn(pill(active), className)} {...props}>{children}</button>
}

export function RiderPillLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} className={pill(active)}>{children}</Link>
}

const tones = {
  signal: 'bg-signal text-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_6px_20px_-6px_rgba(255,210,63,0.55)] hover:bg-[#ffdb63]',
  raised: 'bg-lane text-foreground shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_1px_2px_rgba(0,0,0,0.5)] ring-1 ring-white/10 hover:bg-[#232831]',
  quiet: 'text-muted-foreground hover:text-foreground',
  danger: 'bg-lane text-[#ff8a7f] ring-1 ring-[#ff6b5e]/30 hover:bg-[#ff6b5e]/10',
} as const

/** A raised pill command inside a RiderTrack. */
export function RiderButton({ tone = 'raised', size = 'md', className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { tone?: keyof typeof tones; size?: 'sm' | 'md' | 'lg'; type?: 'button' | 'submit' }) {
  return <button type={props.type ?? 'button'} className={cn('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45', size === 'lg' ? 'min-h-13 px-6 text-base' : size === 'md' ? 'min-h-10 px-4 text-sm' : 'min-h-8 px-3 text-xs', tones[tone], className)} {...props}>{children}</button>
}

export function RiderButtonLink({ href, tone = 'raised', className, children }: { href: string; tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn('inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring', tones[tone], className)}>{children}</Link>
}
