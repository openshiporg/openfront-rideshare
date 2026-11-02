import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Storefront choices and command groups: soft rounded controls in a plain row. The chosen
// option carries the deep harbour-teal edge on a pale foam fill.
export function RiderTrack({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={cn('inline-flex max-w-full flex-wrap items-center gap-2', className)}>{children}</div>
}

const pill = (active: boolean) => cn(
  'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  active ? 'border-tide bg-foam font-semibold text-signal' : 'border-ink/15 bg-kerb text-muted-foreground hover:border-ink/30 hover:text-foreground',
)

export function RiderPill({ active, className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { active: boolean }) {
  return <button type="button" aria-pressed={active} className={cn(pill(active), className)} {...props}>{children}</button>
}

export function RiderPillLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} className={pill(active)}>{children}</Link>
}

const tones = {
  signal: 'bg-[linear-gradient(180deg,#0f5656,#0b4a4a)] text-white shadow-[0_8px_20px_-10px_rgba(11,74,74,0.7)] hover:bg-[linear-gradient(180deg,#0b4a4a,#073838)]',
  raised: 'bg-kerb text-foreground ring-1 ring-ink/20 hover:bg-foam hover:ring-ink/30',
  quiet: 'text-muted-foreground hover:text-foreground',
  danger: 'bg-kerb text-[#c2412d] ring-1 ring-[#d9472b]/30 hover:bg-[#d9472b]/5',
} as const

/** A square command button inside a RiderTrack. */
export function RiderButton({ tone = 'raised', size = 'md', className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { tone?: keyof typeof tones; size?: 'sm' | 'md' | 'lg'; type?: 'button' | 'submit' }) {
  return <button type={props.type ?? 'button'} className={cn('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45', size === 'lg' ? 'min-h-13 px-6 text-[1.0625rem]' : size === 'md' ? 'min-h-10 px-4 text-sm' : 'min-h-8 px-3 text-xs', tones[tone], className)} {...props}>{children}</button>
}

export function RiderButtonLink({ href, tone = 'raised', className, children }: { href: string; tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn('inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring', tones[tone], className)}>{children}</Link>
}
