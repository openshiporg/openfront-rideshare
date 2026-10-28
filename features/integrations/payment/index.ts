export const paymentProviderAdapters = {
  manual: () => import('./manual'),
  stripe: () => import('./stripe'),
} as const
