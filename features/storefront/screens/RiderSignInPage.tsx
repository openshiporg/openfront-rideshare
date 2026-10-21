'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    query(`query RiderIdentity { riderAccountOptions authenticatedItem { ... on User { id name email } } }`).then(data => { if (active) { setIdentity(data.authenticatedItem || null); setSignupAllowed(data.riderAccountOptions?.registrationEnabled === true) } }).catch(() => { if (active) setError('Account details are unavailable. Try again shortly.') })
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
    } catch { setError(register ? 'Account setup is unconfirmed. Try signing in before registering again.' : 'Sign-in was not confirmed. Check your details or try again shortly.') }
    finally { const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = ''; inFlight.current = false; setBusy(false) }
  }
  async function signOut() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try { const result = await query(`mutation RiderSignOut { endSession }`); if (result.endSession !== true) throw new Error(); setIdentity(null); router.refresh() }
    catch { setError('Sign-out is unconfirmed. Check your account before switching users.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main className="min-h-screen bg-background px-5 py-12 text-foreground"><div className="mx-auto w-full max-w-md space-y-6"><Link href="/" className="text-sm underline">Openfront Rideshare</Link><h1 className="text-2xl font-semibold">{identity ? 'Your rider account' : register ? 'Create rider account' : 'Rider sign-in'}</h1>{identity ? <div className="space-y-4"><p className="break-words">{identity.name} · {identity.email}</p><Link href="/account/rides" className="block underline">Your ride history</Link><Button type="button" variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button></div> : register && !signupAllowed ? <p role="status">New account registration is unavailable. Existing riders can <Link className="underline" href="/account/signin">sign in</Link>.</p> : <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">{register && <div><Label htmlFor="rider-name">Name</Label><Input id="rider-name" name="name" required maxLength={160} autoComplete="name" /></div>}<div><Label htmlFor="rider-email">Email</Label><Input id="rider-email" name="email" type="email" required autoComplete="username" /></div><div><Label htmlFor="rider-password">Password</Label><Input id="rider-password" name="password" type="password" required minLength={register ? 10 : undefined} autoComplete={register ? 'new-password' : 'current-password'} /></div></fieldset><Button type="submit" disabled={busy}>{busy ? 'Working…' : register ? 'Create account' : 'Sign in'}</Button></form>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{!identity && <div className="space-y-3 text-sm">{signupAllowed && !register && <Link className="block underline" href="/account/signup">Create a rider account</Link>}<p>Password recovery is currently unavailable on this storefront.</p></div>}<Link href="/book" className="block text-sm underline">Back to ride requests</Link></div></main>
}
