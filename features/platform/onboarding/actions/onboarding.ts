'use server'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

/** Onboarding status is written only by the source-owned bootstrap workflow. */
export async function setOnboardingStatus(): Promise<never> {
  throw new Error('Onboarding status can only be changed by the source-owned bootstrap workflow.')
}

export async function dismissOnboarding() {
  const result = await keystoneClient<{ dismissRideshareOnboarding: boolean }>(`mutation DismissOwnOnboarding { dismissRideshareOnboarding }`)
  const persisted = result.success && result.data?.dismissRideshareOnboarding === true
  return { success: persisted, persisted }
}
