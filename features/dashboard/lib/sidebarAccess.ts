/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type SidebarUser = {
  role?: { canAccessDashboard?: boolean | null } | null
  capabilities?: Record<string, boolean> | null
} | null | undefined

/** Platform pages whose screen needs a fleet capability; the sidebar shows them only to people who hold it. */
export const PLATFORM_CAPABILITY: Record<string, string> = {
  dispatch: 'operations', trips: 'operations', drivers: 'drivers', safety: 'safety', finance: 'finance', team: 'fleetAdmin',
  vehicles: 'operations', reviews: 'operations', services: 'operations', settings: 'fleetAdmin', 'my-driving': 'driver',
}

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * A platform page whose first segment is a list path follows that list's visibility;
 * pages that are not tied to one list stay visible to dashboard users.
 */
export function visiblePlatformItems<T extends { href: string }>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  const hiddenPaths = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  return items.filter((item) => {
    const slug = item.href.split('/platform/')[1]?.split(/[/?#]/)[0]
    if (slug && hiddenPaths.has(slug)) return false
    const needed = slug ? PLATFORM_CAPABILITY[slug] : undefined
    // Unknown capabilities (not loaded) leave the link visible; the page itself still enforces access.
    return !needed || !user?.capabilities || user.capabilities[needed] === true
  })
}
