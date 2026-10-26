import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { StatusDot } from './StatusTitle'

/** Shown where a ride command would be when the fleet has not turned on manual dispatch. */
export function OperationsOffNotice() {
  return <Link href="/dashboard/platform/settings#operations" className="inline-flex items-center gap-1.5 self-start rounded-[4px] bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/15 dark:text-amber-200 md:justify-self-end">
    <StatusDot tone="amber" />Manual dispatch off · Turn on<ArrowUpRight className="size-3.5" aria-hidden="true" />
  </Link>
}
