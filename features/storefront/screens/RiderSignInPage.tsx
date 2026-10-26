'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, LogOut } from 'lucide-react'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderPillLink, RiderTrack } from '../components/RiderPills'

/** Uses native same-origin Keystone session operations. No password, token or
 * GraphQL diagnostic is retained in returned action/form state. */
export default function RiderSignInPage({ register = false }: { register?: boolean }) {
  const router = useRouter()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signupAllowed, setSignupAllowed] = useState(false)
  const [identity, setIdentity] = useState<{ id: string; name: string; email: string } | null>(null)
  async function query(document: string, variables: Record<string, unknown> = {}) {
    const response = await fetch('/api/graphql', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: document, variables }), signal: AbortSignal.timeout(10_000) })
    const payload = await response.json()
    if (!response.ok || payload.errors?.length || !payload.data) throw new Error('Account request could not be confirmed.')
    return payload.data
  }
  useEffect(() => {
    let active = true
    query(`query RiderIdentity { riderAccountOptions authenticatedItem { ... on User { id name email } } }`).then(data => { if (active) { setIdentity(data.authenticatedItem || null); setSignupAllowed(data.riderAccountOptions?.registrationEnabled === true) } }).catch(() => { if (active) setError('Account unavailable. Try again shortly.') })
    return () => { active = false }
  }, [])
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || (register && !signupAllowed)) return
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') || '').trim()
    const password = String(values.get('password') || '')
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (register) {
        const result = await query(`mutation RiderRegistration($name: String!, $email: String!, $password: String!) { createUser(data: { name: $name, email: $email, password: $password }) { id } }`, { name: String(values.get('name') || '').trim(), email, password })
        if (!result.createUser?.id) throw new Error('Account creation could not be confirmed. Try signing in before registering again.')
      }
      const result = await query(`mutation RiderSignIn($email: String!, $password: String!) { authenticateUserWithPassword(email: $email, password: $password) { ... on UserAuthenticationWithPasswordSuccess { item { id } } ... on UserAuthenticationWithPasswordFailure { __typename } } }`, { email, password })
      if (!result.authenticateUserWithPassword?.item?.id) throw new Error('Sign-in could not be confirmed. Check your email and password.')
      router.replace('/account/rides'); router.refresh()
    } catch { setError(register ? 'Account not confirmed. Try signing in before registering again.' : 'Sign-in failed. Check your email and password.') }
    finally { const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = ''; inFlight.current = false; setBusy(false) }
  }
  async function signOut() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { const result = await query(`mutation RiderSignOut { endSession }`); if (result.endSession !== true) throw new Error(); setIdentity(null); router.refresh() }
    catch { setError('Sign-out unconfirmed. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const field = 'h-12 w-full rounded-[6px] bg-asphalt px-4 text-base outline-none ring-1 ring-inset ring-white/10 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-signal'
  return <RiderShell className="flex justify-center">
    <div className="w-full max-w-md space-y-6 sm:pt-6">
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] [font-stretch:125%] sm:text-5xl">{identity ? 'Account' : register ? 'Create account' : 'Sign in'}</h1>
      {identity ? <section className="space-y-5 rounded-[6px] border border-border bg-kerb p-5">
        <div className="flex items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-[4px] bg-signal font-display text-lg font-extrabold uppercase text-zinc-950" aria-hidden="true">{identity.name.trim().slice(0, 1) || '?'}</span><div className="min-w-0"><p className="truncate font-semibold">{identity.name}</p><p className="truncate text-sm text-muted-foreground">{identity.email}</p></div></div>
        <RiderTrack className="w-full"><RiderButtonLink href="/account/rides" tone="signal" className="flex-1">My rides<ArrowRight className="size-4" aria-hidden="true" /></RiderButtonLink><RiderButton tone="quiet" disabled={busy} onClick={() => void signOut()}><LogOut className="size-4" aria-hidden="true" />Sign out</RiderButton></RiderTrack>
      </section> : <section className="space-y-5 rounded-[6px] border border-border bg-kerb p-5">
        {signupAllowed && <RiderTrack label="Account" className="w-full [&>a]:flex-1"><RiderPillLink href="/account/signin" active={!register}>Sign in</RiderPillLink><RiderPillLink href="/account/signup" active={register}>Create account</RiderPillLink></RiderTrack>}
        {register && !signupAllowed ? <p role="status" className="text-sm text-muted-foreground">Registration is closed. <Link className="font-semibold text-foreground underline underline-offset-4" href="/account/signin">Sign in</Link></p> : <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-3">
            {register && <label className="block space-y-1.5"><span className="text-sm font-medium">Name</span><input id="rider-name" name="name" required maxLength={160} autoComplete="name" className={field} /></label>}
            <label className="block space-y-1.5"><span className="text-sm font-medium">Email</span><input id="rider-email" name="email" type="email" required autoComplete="username" className={field} /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Password</span><input id="rider-password" name="password" type="password" required minLength={register ? 10 : undefined} autoComplete={register ? 'new-password' : 'current-password'} className={field} /></label>
          </fieldset>
          <RiderButton type="submit" tone="signal" size="lg" disabled={busy} className="w-full">{busy ? 'Working…' : register ? 'Create account' : 'Sign in'}</RiderButton>
        </form>}
      </section>}
      {error && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}
      <Link href="/book" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">Book a ride<ArrowRight className="size-4" aria-hidden="true" /></Link>
    </div>
  </RiderShell>
}
