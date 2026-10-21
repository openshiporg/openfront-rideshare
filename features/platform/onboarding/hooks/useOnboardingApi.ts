'use client'
import { useRef, useState } from 'react'
import { requireOnboardingBootstrapResult, type OnboardingBootstrapResult } from '../domain/bootstrapResponse'

export function useOnboardingApi() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<OnboardingBootstrapResult | null>(null)
  const inFlight = useRef(false)

  async function runOnboarding(mode: 'minimal' | 'full') {
    if (inFlight.current) return
    inFlight.current = true
    setIsLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Bootstrap($mode:String!){ bootstrapRideshare(mode:$mode){ fleetId created summary } }`,
          variables: { mode },
        }),
      })
      const payload: unknown = await response.json()
      setResult(requireOnboardingBootstrapResult(response.ok, response.status, payload))
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Demo setup could not be confirmed.')
    } finally {
      inFlight.current = false
      setIsLoading(false)
    }
  }

  return { runOnboarding, isLoading, error, result }
}
