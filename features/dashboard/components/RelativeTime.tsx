'use client'

import React from 'react'
import { useIsMounted } from '../lib/useViewerTime'

/** Text that depends on "now": rendered only after mount so server and hydration output match. */
export function RelativeTime({ format }: { format: () => string }) {
  const mounted = useIsMounted()
  if (!mounted) return null
  return <span suppressHydrationWarning>{format()}</span>
}
