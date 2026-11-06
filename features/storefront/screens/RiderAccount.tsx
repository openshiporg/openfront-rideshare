'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { gql, whoAmI, type Identity } from '../lib/api'
import { RiderPage } from '../components/RiderPage'
import { Button, ButtonLink, Icon, Spinner } from '../components/ui'

/** Sign in, create an account, or (signed in) the account itself. Native Keystone session; no password kept in state. */
export default function RiderAccount({ register = false }: { register?: boolean }) {
  const router = useRouter()
  const [identity, setIdentity] = useState<Identity | undefined>(undefined)
  const [signupOpen, setSignupOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    whoAmI().then(found => { if (active) setIdentity(found) }).catch(() => { if (active) setIdentity(null) })
    gql<{ riderAccountOptions: { registrationEnabled?: boolean } }>('query RiderOptions { riderAccountOptions }').then(data => { if (active) setSignupOpen(data.riderAccountOptions?.registrationEnabled === true) }).catch(() => {})
    return () => { active = false }
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') || '').trim()
    const password = String(values.get('password') || '')
    inFlight.current = true; setBusy(true); setError('')
    try {
      if (register) {
        const created = await gql<{ createUser: { id: string } | null }>('mutation RiderRegister($name: String!, $email: String!, $password: String!) { createUser(data: { name: $name, email: $email, password: $password }) { id } }', { name: String(values.get('name') || '').trim(), email, password })
        if (!created.createUser?.id) throw new Error()
      }
      const result = await gql<{ authenticateUserWithPassword: { item?: { id: string } } | null }>('mutation RiderSignIn($email: String!, $password: String!) { authenticateUserWithPassword(email: $email, password: $password) { ... on UserAuthenticationWithPasswordSuccess { item { id } } ... on UserAuthenticationWithPasswordFailure { __typename } } }', { email, password })
      if (!result.authenticateUserWithPassword?.item?.id) throw new Error()
      router.replace('/'); router.refresh()
    } catch { setError(register ? 'We couldn’t create that account. If you already have one, sign in.' : 'That email and password don’t match.') }
    finally {
      const input = form.elements.namedItem('password')
      if (input instanceof HTMLInputElement) input.value = ''
      inFlight.current = false; setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    try { await gql('mutation RiderSignOut { endSession }'); setIdentity(null); router.refresh() } catch { setError('Sign-out didn’t go through. Try again.') }
    setBusy(false)
  }

  if (identity === undefined) return <RiderPage title="Account"><p className="flex items-center gap-3 text-[16px]"><Spinner />Loading…</p></RiderPage>
  if (identity) return <RiderPage title="Account">
    <div className="flex items-center gap-4">
      <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-tide-soft text-tide"><Icon.person className="size-8" /></span>
      <div className="min-w-0"><p className="truncate text-[20px] font-bold">{identity.name}</p><p className="truncate text-[15px] text-ink-2">{identity.email}</p></div>
    </div>
    <div className="mt-6 divide-y divide-rule border-y border-rule">
      <Link href="/account/rides" className="flex min-h-14 items-center justify-between text-[16px] font-medium">My rides<Icon.chevronRight className="size-4 text-ink-3" /></Link>
      <Link href="/" className="flex min-h-14 items-center justify-between text-[16px] font-medium">Book a ride<Icon.chevronRight className="size-4 text-ink-3" /></Link>
    </div>
    <Button tone="danger" className="mt-6 w-full" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
    {error && <p role="alert" className="mt-3 text-[14px] text-alert">{error}</p>}
  </RiderPage>

  const field = 'h-14 w-full rounded-[16px] bg-white ring-1 ring-inset ring-rule px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-tide'
  return <RiderPage title={register ? 'Create account' : 'Sign in'}>
    {register && !signupOpen ? <p className="text-[16px] text-ink-2">New accounts aren’t open right now. <Link href="/account/signin" className="font-semibold text-ink underline underline-offset-2">Sign in</Link></p>
      : <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={busy} className="space-y-3">
          {register && <label className="block"><span className="mb-1.5 block text-[15px] font-medium">Name</span><input name="name" required maxLength={160} autoComplete="name" className={field} /></label>}
          <label className="block"><span className="mb-1.5 block text-[15px] font-medium">Email</span><input name="email" type="email" required autoComplete="username" inputMode="email" className={field} /></label>
          <label className="block"><span className="mb-1.5 block text-[15px] font-medium">Password</span><input name="password" type="password" required minLength={register ? 10 : undefined} autoComplete={register ? 'new-password' : 'current-password'} className={field} /></label>
        </fieldset>
        {error && <p role="alert" className="text-[14px] text-alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <><Spinner className="size-5" />{register ? 'Creating…' : 'Signing in…'}</> : register ? 'Create account' : 'Sign in'}</Button>
      </form>}
    {signupOpen && <p className="mt-5 text-center text-[15px] text-ink-2">{register ? 'Already have an account? ' : 'New here? '}<Link href={register ? '/account/signin' : '/account/signup'} className="font-semibold text-ink underline underline-offset-2">{register ? 'Sign in' : 'Create an account'}</Link></p>}
    <ButtonLink href="/" tone="secondary" className="mt-4 w-full">Continue as guest</ButtonLink>
  </RiderPage>
}
