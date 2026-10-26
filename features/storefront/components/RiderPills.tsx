import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Storefront choices and command groups: square kerb-stone controls in a plain row. The chosen
// option carries the signal-yellow edge, like a painted kerb line.
export function RiderTrack({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={cn('inline-flex max-w-full flex-wrap items-center gap-2', className)}>{children}</div>
}

const pill = (active: boolean) => cn(
  'inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[3px] border px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  active ? 'border-signal bg-lane font-semibold text-foreground' : 'border-white/15 text-muted-foreground hover:border-white/35 hover:text-foreground',
)

export function RiderPill({ active, className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { active: boolean }) {
  return <button type="button" aria-pressed={active} className={cn(pill(active), className)} {...props}>{children}</button>
}

export function RiderPillLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={active ? 'page' : undefined} className={pill(active)}>{children}</Link>
}

const tones = {
  signal: 'bg-signal text-zinc-950 hover:bg-[#ffdb63]',
  raised: 'bg-lane text-foreground ring-1 ring-white/20 hover:bg-[#232831] hover:ring-white/35',
  quiet: 'text-muted-foreground hover:text-foreground',
  danger: 'bg-lane text-[#ff8a7f] ring-1 ring-[#ff6b5e]/30 hover:bg-[#ff6b5e]/10',
} as const

/** A square command button inside a RiderTrack. */
export function RiderButton({ tone = 'raised', size = 'md', className, children, ...props }: Omit<ComponentProps<'button'>, 'type'> & { tone?: keyof typeof tones; size?: 'sm' | 'md' | 'lg'; type?: 'button' | 'submit' }) {
  return <button type={props.type ?? 'button'} className={cn('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[3px] font-semibold transition-[background-color,color,opacity] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45', size === 'lg' ? 'min-h-13 px-6 text-base' : size === 'md' ? 'min-h-10 px-4 text-sm' : 'min-h-8 px-3 text-xs', tones[tone], className)} {...props}>{children}</button>
}

export function RiderButtonLink({ href, tone = 'raised', className, children }: { href: string; tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <Link href={href} className={cn('inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[3px] px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring', tones[tone], className)}>{children}</Link>
}
