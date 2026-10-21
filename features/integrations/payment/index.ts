export const paymentProviderAdapters = {
  manual: () => import('./manual'),
} as const
