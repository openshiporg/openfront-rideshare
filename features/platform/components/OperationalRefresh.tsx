'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function OperationalRefresh({ revision }: { revision: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [paused, setPaused] = useState(false)
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
  return <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-live="polite"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={refresh}>{pending ? 'Refreshing…' : 'Refresh'}</Button><span>Loaded {new Date(revision).toLocaleTimeString()}{paused ? ' · refresh paused while editing or reconciling a command' : ''}</span></div>
}
