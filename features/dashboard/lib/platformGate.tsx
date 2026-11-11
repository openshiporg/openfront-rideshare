import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { keystoneClient } from './keystoneClient'
import { PLATFORM_CAPABILITY } from './sidebarAccess'

/** 404s a platform page when the signed-in person holds no fleet capability for it (same mapping as the sidebar). */
export function gatePlatformPage<P extends object>(slug: string, Page: ComponentType<P>) {
  return async function GatedPlatformPage(props: P) {
    const needed = PLATFORM_CAPABILITY[slug]
    const response = await keystoneClient('query { rideshareCapabilities }')
    const capabilities = response.success ? response.data?.rideshareCapabilities : null
    if (needed && capabilities && capabilities[needed] !== true) notFound()
    return <Page {...props} />
  }
}
