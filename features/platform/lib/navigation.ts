import type { LucideIcon } from 'lucide-react'
import { CarFront, CircleDollarSign, MapPinned, Package, RadioTower, Settings, ShieldAlert, Users } from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

// Platform navigation items, relative to the dashboard basePath, as in the family Sidebar.
export const platformNavItems: PlatformNavItem[] = [
  // Standalone
  { title: 'Dispatch', href: '/platform/dispatch', color: 'cyan', description: 'Manual dispatch of ride requests to eligible drivers and vehicles.', icon: RadioTower, group: 'standalone' },
  { title: 'My driving', href: '/platform/my-driving', color: 'lime', description: 'Review offers and update assigned-trip progress.', icon: CarFront, group: 'standalone' },

  // Operations
  { title: 'Trips', href: '/platform/trips', color: 'blue', description: 'Operate scheduled, active, and completed trips.', icon: CarFront, group: 'operations' },
  { title: 'Services & fares', href: '/platform/services', color: 'orange', description: 'Service areas, ride services and fare versions.', icon: MapPinned, group: 'operations' },

  // People & safety
  { title: 'Drivers', href: '/platform/drivers', color: 'purple', description: 'Review fleet-scoped driver readiness records.', icon: Users, group: 'people' },
  { title: 'Safety & support', href: '/platform/safety', color: 'red', description: 'Restricted incident and support case queue.', icon: ShieldAlert, group: 'people' },

  // Business
  { title: 'Finance', href: '/platform/finance', color: 'emerald', description: 'Restricted finance evidence and payment status review.', icon: CircleDollarSign, group: 'business' },
  { title: 'Settings', href: '/platform/settings', color: 'slate', description: 'Configure operations and external dependency boundaries.', icon: Settings, group: 'business' },
]

export const platformStandaloneItems = platformNavItems.filter((item) => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'operations', title: 'Operations', icon: CarFront, items: platformNavItems.filter((item) => item.group === 'operations') },
  { id: 'people', title: 'People & safety', icon: Users, items: platformNavItems.filter((item) => item.group === 'people') },
  { id: 'business', title: 'Business', icon: CircleDollarSign, items: platformNavItems.filter((item) => item.group === 'business') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.map((item) => ({ ...item, href: `${basePath}${item.href}` }))
}

export function getIconForNavItem(title: string): LucideIcon {
  return platformNavItems.find((item) => item.title === title)?.icon || Package
}
