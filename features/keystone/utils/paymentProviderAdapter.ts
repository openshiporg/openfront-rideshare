import { paymentProviderAdapters } from '../../integrations/payment'

export async function executePaymentAdapter({ provider, functionName, args }: { provider: any; functionName: string; args: any }) {
  const adapterName = provider[functionName]
  const loader = paymentProviderAdapters[adapterName as keyof typeof paymentProviderAdapters]
  if (!loader) throw new Error('Payment adapter is not admitted by this deployment.')
  const adapter = await loader()
  const fn = (adapter as any)[functionName]
  if (typeof fn !== 'function') throw new Error(`Payment adapter does not implement ${functionName}.`)
  return fn({ provider, ...args })
}
