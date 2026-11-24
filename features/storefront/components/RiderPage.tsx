'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { whoAmI, type Identity } from '../lib/api'
import { RiderHeader, useFleet } from './RiderHeader'
import { Icon } from './ui'

/** The page for account screens: the same header bar as the map, then a back arrow, a big title and the content on one card. */
export function RiderPage(props: { title: string; children: React.ReactNode; back?: string; identity?: Identity | undefined }) {
  const { title, children, back = '/', identity: known } = props
  const router = useRouter()
  const fleet = useFleet()
  const [found, setFound] = useState<Identity | undefined>(undefined)
  const given = 'identity' in props // a screen that already asks who is signed in passes it, loading or not
  useEffect(() => {
    if (given) return
    let active = true
    whoAmI().then(who => { if (active) setFound(who) }).catch(() => { if (active) setFound(null) })
    return () => { active = false }
  }, [given])
  return <div className="rider flex min-h-dvh flex-col bg-paper text-ink lg:bg-[#ece8de]">
    <RiderHeader identity={given ? known : found} fleet={fleet} className="sticky top-0" />
    <main className="mx-auto w-full max-w-[560px] flex-1 px-4 pb-16 pt-3 lg:pt-10">
      <div className="lg:rounded-[28px] lg:bg-paper lg:p-8 lg:shadow-[0_1px_0_rgba(16,35,31,0.04),0_24px_48px_-32px_rgba(16,35,31,0.35)] lg:ring-1 lg:ring-rule">
        <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push(back))} className="press -ml-2.5 grid size-11 place-items-center rounded-full outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-tide"><Icon.back className="size-6" /></button>
        <h1 className="display mt-1 text-[28px] font-bold leading-9 tracking-[-0.02em]">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  </div>
}
