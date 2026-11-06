'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

/** The plain white page for account screens: a back arrow, a big title, then content (Uber's account pages). */
export function RiderPage({ title, children, back = '/' }: { title: string; children: React.ReactNode; back?: string }) {
  const router = useRouter()
  return <div className="rider min-h-dvh bg-paper text-ink">
    <div className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-[max(env(safe-area-inset-top),12px)]">
      <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push(back))} className="press -ml-2 grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-tide"><Icon.back className="size-6" /></button>
      <h1 className="display mt-2 text-[32px] font-bold leading-10">{title}</h1>
      <div className="mt-6">{children}</div>
      <nav aria-label="Rider" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-rule pt-5 text-[14px] text-ink-2">
        <Link href="/" className="hover:text-ink">Book a ride</Link>
        <Link href="/account/rides" className="hover:text-ink">My rides</Link>
        <Link href="/dashboard" className="hover:text-ink">Drivers &amp; operators</Link>
      </nav>
    </div>
  </div>
}
