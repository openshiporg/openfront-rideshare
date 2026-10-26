'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { StatusDot } from './StatusTitle'

export function OperationalRefresh({ revision }: { revision: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [paused, setPaused] = useState(false)
  // Server (UTC) and browser time zones differ, so the stamp renders only after mount.
  const [stamp, setStamp] = useState('')
  useEffect(() => { setStamp(new Date(revision).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })) }, [revision])
  function refresh() {
    const editing = document.querySelector('[role="dialog"], [data-unsaved="true"], [data-command-pending="true"]') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')
    setPaused(Boolean(editing))
    if (!pending && !editing && document.visibilityState === 'visible') startTransition(() => router.refresh())
  }
  useEffect(() => {
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh) }
  }, [pending, router])
  return <div className="flex items-center gap-1 rounded-[4px] bg-muted p-1 text-xs ring-1 ring-inset ring-foreground/5" aria-live="polite">
    <span className="flex items-center gap-1.5 px-2.5 tabular-nums text-muted-foreground"><StatusDot tone={paused ? 'amber' : 'green'} pulse={!paused} />{paused ? 'Paused' : 'Live'}{stamp ? ` · ${stamp}` : ''}</span>
    <button type="button" disabled={pending} onClick={refresh} className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-background px-3 font-medium text-foreground shadow-sm ring-1 ring-foreground/10 transition-opacity disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <RefreshCw className={`size-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />{pending ? 'Refreshing' : 'Refresh'}
    </button>
  </div>
}
